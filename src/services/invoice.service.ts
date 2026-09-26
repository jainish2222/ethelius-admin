import "server-only";
import type { z } from "zod";
import { prisma, type Tx } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { audit } from "@/lib/audit";
import { notify } from "@/lib/notify";
import type { Actor } from "@/lib/api/handler";
import { badRequest, conflict, notFound } from "@/lib/api/errors";
import { csv, orderBy, paging, type ListQuery } from "@/lib/api/list-query";
import {
  addDays, addMonths, currentMonth, dateOnly, monthBounds, monthLabel, monthRange, parseDateOnly, termDays, todayDateOnly, type Month,
} from "@/lib/dates";
import { formatMoney, round2 } from "@/lib/money";
import { dec } from "@/lib/serialize";
import type { invoiceSchema } from "@/validations/finance";

type InvoiceData = z.output<typeof invoiceSchema>;

function totals(items: { quantity: number; unitPrice: number }[], taxPercent: number, discount: number) {
  const subtotal = round2(items.reduce((s, i) => s + round2(i.quantity * i.unitPrice), 0));
  const taxable = Math.max(subtotal - discount, 0);
  const taxAmount = round2((taxable * taxPercent) / 100);
  return { subtotal, taxAmount, total: round2(taxable + taxAmount) };
}

async function nextInvoiceNumber(tx: Tx, invoiceDate: string) {
  const prefix = `INV-${invoiceDate.slice(0, 4)}-`;
  const last = await tx.invoice.findFirst({ where: { invoiceNumber: { startsWith: prefix } }, orderBy: { invoiceNumber: "desc" }, select: { invoiceNumber: true } });
  const n = last ? parseInt(last.invoiceNumber.slice(prefix.length), 10) + 1 : 1;
  return `${prefix}${String(n).padStart(4, "0")}`;
}

/**
 * Re-derives what has been settled on an invoice from its payments and sets the status.
 * Past-due invoices with money still owed are OVERDUE even when partly paid.
 */
export async function recomputeInvoice(invoiceId: string, tx: Tx | typeof prisma = prisma) {
  const inv = await tx.invoice.findUnique({ where: { id: invoiceId } });
  if (!inv) return null;
  const agg = await tx.payment.aggregate({
    where: { invoiceId, deletedAt: null, status: { in: ["RECEIVED", "RECONCILED"] } },
    _sum: { amountReceived: true },
  });
  const settled = round2(dec(agg._sum.amountReceived));
  let status = inv.status;
  if (inv.status !== "DRAFT" && inv.status !== "CANCELLED") {
    const outstanding = dec(inv.total) - settled;
    if (outstanding <= 0.005) status = "PAID";
    else if (dateOnly(inv.dueDate) < todayDateOnly()) status = "OVERDUE";
    else if (settled > 0) status = "PARTIALLY_PAID";
    else status = "SENT";
  }
  return tx.invoice.update({ where: { id: invoiceId }, data: { amountSettled: settled, status } });
}

/** Flags newly past-due invoices and alerts finance once per invoice. */
export async function syncOverdueInvoices() {
  const today = parseDateOnly(todayDateOnly());
  const due = await prisma.invoice.findMany({
    where: { deletedAt: null, status: { in: ["SENT", "PARTIALLY_PAID"] }, dueDate: { lt: today } },
    include: { company: { select: { name: true } } },
  });
  for (const inv of due) {
    if (dec(inv.total) - dec(inv.amountSettled) <= 0.005) continue;
    await prisma.invoice.update({ where: { id: inv.id }, data: { status: "OVERDUE" } });
    await notify({
      type: "INVOICE_OVERDUE",
      title: `${inv.invoiceNumber} is overdue`,
      body: `${inv.company.name} · ${formatMoney(dec(inv.total) - dec(inv.amountSettled), inv.currency)} outstanding since ${dateOnly(inv.dueDate)}`,
      link: `/invoices/${inv.id}`,
      permission: "billing.read",
      dedupeKey: `invoice-overdue:${inv.id}`,
    });
  }
}

export async function listInvoices(q: ListQuery) {
  await syncOverdueInvoices();
  const where: Prisma.InvoiceWhereInput = { deletedAt: null };
  if (q.q) where.OR = [
    { invoiceNumber: { contains: q.q, mode: "insensitive" } },
    { company: { name: { contains: q.q, mode: "insensitive" } } },
    { project: { name: { contains: q.q, mode: "insensitive" } } },
  ];
  const statuses = csv(q.status);
  if (statuses.length) where.status = { in: statuses as never };
  if (q.companyId) where.companyId = String(q.companyId);
  if (q.projectId) where.projectId = String(q.projectId);
  if (q.month) where.billingMonth = String(q.month);
  if (q.year) where.billingMonth = { startsWith: `${q.year}-` };
  if (q.from || q.to) where.invoiceDate = {
    ...(q.from ? { gte: parseDateOnly(String(q.from)) } : {}),
    ...(q.to ? { lte: parseDateOnly(String(q.to)) } : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.invoice.findMany({
      where,
      orderBy: orderBy(q, {
        invoiceNumber: (d) => ({ invoiceNumber: d }),
        company: (d) => ({ company: { name: d } }),
        billingMonth: (d) => ({ billingMonth: d }),
        invoiceDate: (d) => ({ invoiceDate: d }),
        dueDate: (d) => ({ dueDate: d }),
        total: (d) => ({ total: d }),
        status: (d) => ({ status: d }),
      }, [{ invoiceDate: "desc" }, { invoiceNumber: "desc" }] as Prisma.InvoiceOrderByWithRelationInput[]),
      ...paging(q),
      include: {
        company: { select: { id: true, name: true } },
        project: { select: { id: true, name: true, code: true } },
        _count: { select: { payments: { where: { deletedAt: null } } } },
      },
    }),
    prisma.invoice.count({ where }),
  ]);
  return {
    total, page: q.page, pageSize: q.pageSize,
    data: rows.map((i) => ({
      ...i,
      invoiceDate: dateOnly(i.invoiceDate),
      dueDate: dateOnly(i.dueDate),
      outstanding: round2(Math.max(dec(i.total) - dec(i.amountSettled), 0)),
      paymentCount: i._count.payments,
    })),
  };
}

export async function getInvoice(id: string) {
  const inv = await prisma.invoice.findFirst({
    where: { id, deletedAt: null },
    include: {
      company: { select: { id: true, name: true, legalName: true, address: true, gstNumber: true, billingEmail: true } },
      project: { select: { id: true, name: true, code: true } },
      items: { orderBy: { sortOrder: "asc" } },
      payments: { where: { deletedAt: null }, orderBy: { paymentDate: "asc" } },
      createdBy: { select: { name: true } },
    },
  });
  if (!inv) throw notFound("Invoice");
  const bankCredited = inv.payments.filter((p) => ["RECEIVED", "RECONCILED"].includes(p.status)).reduce((s, p) => s + dec(p.bankCredit), 0);
  const deductions = inv.payments.filter((p) => ["RECEIVED", "RECONCILED"].includes(p.status)).reduce((s, p) => s + dec(p.tdsDeducted) + dec(p.otherDeduction), 0);
  return {
    ...inv,
    invoiceDate: dateOnly(inv.invoiceDate),
    dueDate: dateOnly(inv.dueDate),
    payments: inv.payments.map((p) => ({ ...p, paymentDate: dateOnly(p.paymentDate) })),
    outstanding: round2(Math.max(dec(inv.total) - dec(inv.amountSettled), 0)),
    bankCredited: round2(bankCredited),
    deductions: round2(deductions),
  };
}

async function resolveRefs(input: InvoiceData) {
  const company = await prisma.company.findFirst({ where: { id: input.companyId, deletedAt: null } });
  if (!company) throw notFound("Company");
  let project = null;
  if (input.projectId) {
    project = await prisma.project.findFirst({ where: { id: input.projectId, deletedAt: null } });
    if (!project) throw notFound("Project");
    if (project.companyId !== company.id) throw badRequest("That project belongs to a different company.");
  }
  return { company, project };
}

async function assertNoDuplicate(projectId: string | null, billingMonth: string | null, excludeId?: string) {
  if (!projectId || !billingMonth) return;
  const dup = await prisma.invoice.findFirst({
    where: { projectId, billingMonth, deletedAt: null, status: { not: "CANCELLED" }, id: excludeId ? { not: excludeId } : undefined },
    select: { invoiceNumber: true },
  });
  if (dup) throw conflict(`${dup.invoiceNumber} already bills this project for ${monthLabel(billingMonth)}.`);
}

export async function createInvoice(input: InvoiceData, actor: Actor) {
  const { company, project } = await resolveRefs(input);
  await assertNoDuplicate(input.projectId, input.billingMonth);
  const terms = input.paymentTerms ?? project?.paymentTerms ?? company.paymentTerms;
  const due = input.dueDate ?? dateOnly(addDays(parseDateOnly(input.invoiceDate), termDays(terms, project?.customPaymentDays ?? company.customPaymentDays)));
  const t = totals(input.items, input.taxPercent, input.discountAmount);

  const inv = await prisma.$transaction(async (tx) => {
    const invoiceNumber = input.invoiceNumber?.trim() || (await nextInvoiceNumber(tx, input.invoiceDate));
    const created = await tx.invoice.create({
      data: {
        invoiceNumber,
        companyId: company.id,
        projectId: project?.id ?? null,
        billingMonth: input.billingMonth,
        invoiceDate: parseDateOnly(input.invoiceDate),
        dueDate: parseDateOnly(due),
        currency: input.currency,
        exchangeRate: input.exchangeRate,
        taxPercent: input.taxPercent,
        discountAmount: input.discountAmount,
        paymentTerms: terms,
        status: input.status,
        sentAt: input.status === "SENT" ? new Date() : null,
        notes: input.notes,
        createdById: actor.userId,
        ...t,
        items: { create: input.items.map((i, idx) => ({ ...i, amount: round2(i.quantity * i.unitPrice), sortOrder: idx })) },
      },
    });
    await audit(actor, { action: "invoice.created", entity: "Invoice", entityId: created.id, newValue: { invoiceNumber, company: company.name, total: t.total, status: input.status } }, tx);
    return created;
  });
  if (inv.status === "SENT") await recomputeInvoice(inv.id);
  return inv;
}

export async function updateInvoice(id: string, input: InvoiceData, actor: Actor) {
  const before = await prisma.invoice.findFirst({ where: { id, deletedAt: null } });
  if (!before) throw notFound("Invoice");
  if (before.status !== "DRAFT") throw conflict("Only draft invoices can be edited. Cancel and reissue a sent invoice instead.");
  const { company, project } = await resolveRefs(input);
  await assertNoDuplicate(input.projectId, input.billingMonth, id);
  const terms = input.paymentTerms ?? project?.paymentTerms ?? company.paymentTerms;
  const due = input.dueDate ?? dateOnly(addDays(parseDateOnly(input.invoiceDate), termDays(terms, project?.customPaymentDays ?? company.customPaymentDays)));
  const t = totals(input.items, input.taxPercent, input.discountAmount);

  const after = await prisma.$transaction(async (tx) => {
    await tx.invoiceItem.deleteMany({ where: { invoiceId: id } });
    const updated = await tx.invoice.update({
      where: { id },
      data: {
        companyId: company.id,
        projectId: project?.id ?? null,
        billingMonth: input.billingMonth,
        invoiceDate: parseDateOnly(input.invoiceDate),
        dueDate: parseDateOnly(due),
        currency: input.currency,
        exchangeRate: input.exchangeRate,
        taxPercent: input.taxPercent,
        discountAmount: input.discountAmount,
        paymentTerms: terms,
        status: input.status,
        sentAt: input.status === "SENT" ? new Date() : null,
        notes: input.notes,
        ...t,
        items: { create: input.items.map((i, idx) => ({ ...i, amount: round2(i.quantity * i.unitPrice), sortOrder: idx })) },
      },
    });
    await audit(actor, { action: "invoice.updated", entity: "Invoice", entityId: id, oldValue: { total: before.total, status: before.status }, newValue: { total: t.total, status: input.status } }, tx);
    return updated;
  });
  if (after.status === "SENT") await recomputeInvoice(id);
  return after;
}

export async function changeInvoiceStatus(id: string, action: "send" | "cancel" | "reopen", actor: Actor) {
  const inv = await prisma.invoice.findFirst({ where: { id, deletedAt: null }, include: { payments: { where: { deletedAt: null, status: { not: "FAILED" } } } } });
  if (!inv) throw notFound("Invoice");

  if (action === "send") {
    if (inv.status !== "DRAFT") throw conflict("Only drafts can be sent.");
    await prisma.invoice.update({ where: { id }, data: { status: "SENT", sentAt: new Date() } });
    await recomputeInvoice(id);
  } else if (action === "cancel") {
    if (inv.status === "CANCELLED") return inv;
    if (inv.payments.length) throw conflict("Payments are recorded against this invoice. Archive those payments before cancelling it.");
    await prisma.invoice.update({ where: { id }, data: { status: "CANCELLED" } });
  } else {
    if (inv.status !== "CANCELLED") throw conflict("Only cancelled invoices can be reopened.");
    await assertNoDuplicate(inv.projectId, inv.billingMonth, id);
    await prisma.invoice.update({ where: { id }, data: { status: "DRAFT", sentAt: null } });
  }
  await audit(actor, { action: `invoice.${action === "send" ? "sent" : action === "cancel" ? "cancelled" : "reopened"}`, entity: "Invoice", entityId: id, oldValue: { status: inv.status } });
  return prisma.invoice.findUnique({ where: { id } });
}

export async function archiveInvoice(id: string, actor: Actor) {
  const inv = await prisma.invoice.findFirst({ where: { id, deletedAt: null }, include: { _count: { select: { payments: { where: { deletedAt: null } } } } } });
  if (!inv) throw notFound("Invoice");
  if (inv._count.payments) throw conflict("This invoice has payments recorded. Archive the payments first.");
  await prisma.invoice.update({ where: { id }, data: { deletedAt: new Date() } });
  await audit(actor, { action: "invoice.archived", entity: "Invoice", entityId: id, oldValue: { invoiceNumber: inv.invoiceNumber, total: inv.total } });
}

/** Projects that should be billed for a month under monthly billing. */
async function billableProjects(month: Month, projectIds?: string[]) {
  const { start, end } = monthBounds(month);
  return prisma.project.findMany({
    where: {
      deletedAt: null,
      id: projectIds?.length ? { in: projectIds } : undefined,
      billingType: "MONTHLY",
      status: { in: ["ACTIVE", "ON_HOLD", "COMPLETED"] },
      monthlyBillingAmount: { gt: 0 },
      startDate: { lte: end },
      OR: [{ endDate: null }, { endDate: { gte: start } }],
    },
    include: { company: true },
    orderBy: { name: "asc" },
  });
}

/** Creates one monthly invoice per billable project that has none for the month. */
export async function generateMonthlyInvoices(month: Month, projectIds: string[] | undefined, send: boolean, actor: Actor) {
  const projects = await billableProjects(month, projectIds);
  const existing = await prisma.invoice.findMany({
    where: { billingMonth: month, deletedAt: null, status: { not: "CANCELLED" }, projectId: { in: projects.map((p) => p.id) } },
    select: { projectId: true },
  });
  const done = new Set(existing.map((e) => e.projectId));
  const nextMonthStart = dateOnly(monthBounds(addMonths(month, 1)).start);
  const today = todayDateOnly();
  const invoiceDate = nextMonthStart <= today ? nextMonthStart : today;

  const created: string[] = [];
  for (const p of projects) {
    if (done.has(p.id)) continue;
    const inv = await createInvoice({
      companyId: p.companyId,
      projectId: p.id,
      billingMonth: month,
      invoiceDate,
      dueDate: null,
      currency: p.currency as InvoiceData["currency"],
      exchangeRate: p.currency === "INR" ? 1 : await latestRate(p.companyId, p.currency),
      taxPercent: dec(p.taxPercent),
      discountAmount: 0,
      paymentTerms: p.paymentTerms,
      status: send ? "SENT" : "DRAFT",
      notes: null,
      items: [{ description: `Professional services — ${p.name} — ${monthLabel(month)}`, quantity: 1, unitPrice: dec(p.monthlyBillingAmount) }],
    }, actor);
    created.push(inv.invoiceNumber);
  }
  await audit(actor, { action: "invoice.generated_monthly", entity: "Invoice", newValue: { month, created } });
  return { created: created.length, skipped: projects.length - created.length, invoiceNumbers: created };
}

/** Reuses the last exchange rate billed to a company for a currency. */
async function latestRate(companyId: string, currency: string) {
  const last = await prisma.invoice.findFirst({ where: { companyId, currency, deletedAt: null }, orderBy: { invoiceDate: "desc" }, select: { exchangeRate: true } });
  return last ? dec(last.exchangeRate) : 1;
}

/** Project × month grid for the Monthly Billing page. */
export async function billingGrid(from: Month, to: Month, companyId?: string) {
  await syncOverdueInvoices();
  const months = monthRange(from, to);
  const { start } = monthBounds(from);
  const { end } = monthBounds(to);
  const projects = await prisma.project.findMany({
    where: {
      deletedAt: null,
      companyId: companyId || undefined,
      OR: [
        { billingType: "MONTHLY", startDate: { lte: end }, AND: [{ OR: [{ endDate: null }, { endDate: { gte: start } }] }] },
        { invoices: { some: { billingMonth: { in: months }, deletedAt: null } } },
      ],
    },
    include: { company: { select: { id: true, name: true } } },
    orderBy: [{ company: { name: "asc" } }, { name: "asc" }],
  });
  const invoices = await prisma.invoice.findMany({
    where: { projectId: { in: projects.map((p) => p.id) }, billingMonth: { in: months }, deletedAt: null, status: { not: "CANCELLED" } },
    select: { id: true, projectId: true, billingMonth: true, invoiceNumber: true, total: true, amountSettled: true, status: true, currency: true, exchangeRate: true },
  });

  const rows = projects.map((p) => {
    const cells = months.map((m) => {
      const inv = invoices.find((i) => i.projectId === p.id && i.billingMonth === m);
      const { start: ms, end: me } = monthBounds(m);
      const billable = p.billingType === "MONTHLY" && p.startDate <= me && (!p.endDate || p.endDate >= ms);
      if (!inv) return { month: m, billable, invoice: null };
      return {
        month: m, billable,
        invoice: {
          id: inv.id, invoiceNumber: inv.invoiceNumber, status: inv.status, currency: inv.currency,
          total: dec(inv.total), settled: dec(inv.amountSettled), outstanding: round2(Math.max(dec(inv.total) - dec(inv.amountSettled), 0)),
        },
      };
    });
    return {
      project: { id: p.id, name: p.name, code: p.code, billingType: p.billingType, monthlyBillingAmount: dec(p.monthlyBillingAmount), currency: p.currency, status: p.status },
      company: p.company,
      cells,
    };
  });

  const monthTotals = months.map((m) => {
    const inMonth = invoices.filter((i) => i.billingMonth === m);
    return {
      month: m,
      invoiced: round2(inMonth.filter((i) => i.status !== "DRAFT").reduce((s, i) => s + dec(i.total) * dec(i.exchangeRate), 0)),
      received: round2(inMonth.reduce((s, i) => s + dec(i.amountSettled) * dec(i.exchangeRate), 0)),
      missing: rows.filter((r) => r.cells.find((c) => c.month === m && c.billable && !c.invoice)).length,
    };
  });
  return { months, rows, monthTotals, defaultMonth: currentMonth() };
}
