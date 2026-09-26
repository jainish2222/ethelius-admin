import "server-only";
import type { z } from "zod";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { audit, diff } from "@/lib/audit";
import { notify } from "@/lib/notify";
import type { Actor } from "@/lib/api/handler";
import { badRequest, notFound } from "@/lib/api/errors";
import { csv, orderBy, paging, type ListQuery } from "@/lib/api/list-query";
import { dateOnly, parseDateOnly, todayDateOnly } from "@/lib/dates";
import { formatMoney, round2 } from "@/lib/money";
import { dec } from "@/lib/serialize";
import type { paymentSchema } from "@/validations/finance";
import { recomputeInvoice, syncOverdueInvoices } from "./invoice.service";

type PaymentData = z.output<typeof paymentSchema>;

const COUNTED = ["RECEIVED", "RECONCILED"];

export async function listPayments(q: ListQuery) {
  const where: Prisma.PaymentWhereInput = { deletedAt: null };
  if (q.q) where.OR = [
    { transactionRef: { contains: q.q, mode: "insensitive" } },
    { utr: { contains: q.q, mode: "insensitive" } },
    { company: { name: { contains: q.q, mode: "insensitive" } } },
    { invoice: { invoiceNumber: { contains: q.q, mode: "insensitive" } } },
  ];
  const statuses = csv(q.status);
  if (statuses.length) where.status = { in: statuses as never };
  if (q.companyId) where.companyId = String(q.companyId);
  if (q.projectId) where.projectId = String(q.projectId);
  if (q.invoiceId) where.invoiceId = String(q.invoiceId);
  if (q.method) where.method = q.method as never;
  if (q.from || q.to) where.paymentDate = {
    ...(q.from ? { gte: parseDateOnly(String(q.from)) } : {}),
    ...(q.to ? { lte: parseDateOnly(String(q.to)) } : {}),
  };

  const [rows, total, sums] = await Promise.all([
    prisma.payment.findMany({
      where,
      orderBy: orderBy(q, {
        paymentDate: (d) => ({ paymentDate: d }),
        company: (d) => ({ company: { name: d } }),
        amountReceived: (d) => ({ amountReceived: d }),
        bankCredit: (d) => ({ bankCredit: d }),
        status: (d) => ({ status: d }),
      }, [{ paymentDate: "desc" }, { createdAt: "desc" }] as Prisma.PaymentOrderByWithRelationInput[]),
      ...paging(q),
      include: {
        company: { select: { id: true, name: true } },
        project: { select: { id: true, name: true, code: true } },
        invoice: { select: { id: true, invoiceNumber: true, billingMonth: true, total: true } },
      },
    }),
    prisma.payment.count({ where }),
    prisma.payment.aggregate({
      where: { AND: [where, { status: { in: COUNTED as never } }] },
      _sum: { amountReceived: true, tdsDeducted: true, otherDeduction: true, bankCredit: true },
    }),
  ]);
  return {
    total, page: q.page, pageSize: q.pageSize,
    data: rows.map((p) => ({ ...p, paymentDate: dateOnly(p.paymentDate) })),
    summary: {
      settled: dec(sums._sum.amountReceived),
      tds: dec(sums._sum.tdsDeducted),
      other: dec(sums._sum.otherDeduction),
      bankCredit: dec(sums._sum.bankCredit),
    },
  };
}

export async function getPayment(id: string) {
  const p = await prisma.payment.findFirst({
    where: { id, deletedAt: null },
    include: {
      company: { select: { id: true, name: true } },
      project: { select: { id: true, name: true } },
      invoice: { select: { id: true, invoiceNumber: true, total: true, amountSettled: true, currency: true } },
      createdBy: { select: { name: true } },
    },
  });
  if (!p) throw notFound("Payment");
  return { ...p, paymentDate: dateOnly(p.paymentDate) };
}

/** Checks references and that a payment does not settle more than the invoice still owes. */
async function validate(input: PaymentData, excludeId?: string) {
  const company = await prisma.company.findFirst({ where: { id: input.companyId, deletedAt: null } });
  if (!company) throw notFound("Company");
  let projectId = input.projectId;
  if (input.invoiceId) {
    const inv = await prisma.invoice.findFirst({ where: { id: input.invoiceId, deletedAt: null } });
    if (!inv) throw notFound("Invoice");
    if (inv.companyId !== input.companyId) throw badRequest("That invoice belongs to a different company.");
    if (inv.status === "CANCELLED" || inv.status === "DRAFT") throw badRequest("Payments can only be recorded against sent invoices.");
    projectId = inv.projectId ?? projectId;
    if (COUNTED.includes(input.status)) {
      const others = await prisma.payment.aggregate({
        where: { invoiceId: inv.id, deletedAt: null, status: { in: COUNTED as never }, id: excludeId ? { not: excludeId } : undefined },
        _sum: { amountReceived: true },
      });
      const remaining = round2(dec(inv.total) - dec(others._sum.amountReceived));
      if (input.amountReceived > remaining + 0.005) {
        throw badRequest(`Only ${formatMoney(remaining, inv.currency)} is outstanding on ${inv.invoiceNumber}.`, {
          fields: { amountReceived: `At most ${formatMoney(remaining, inv.currency)}` },
        });
      }
    }
  } else if (projectId) {
    const p = await prisma.project.findFirst({ where: { id: projectId, deletedAt: null } });
    if (!p || p.companyId !== input.companyId) throw badRequest("That project belongs to a different company.");
  }
  return { company, projectId };
}

const toData = (input: PaymentData, projectId: string | null) => ({
  companyId: input.companyId,
  projectId,
  invoiceId: input.invoiceId,
  paymentDate: parseDateOnly(input.paymentDate),
  amountReceived: input.amountReceived,
  tdsDeducted: input.tdsDeducted,
  otherDeduction: input.otherDeduction,
  bankCredit: round2(input.amountReceived - input.tdsDeducted - input.otherDeduction),
  currency: input.currency,
  exchangeRate: input.exchangeRate,
  method: input.method,
  bankAccount: input.bankAccount,
  transactionRef: input.transactionRef,
  utr: input.utr,
  status: input.status,
  notes: input.notes,
});

async function announce(paymentId: string, actor: Actor) {
  const p = await prisma.payment.findUnique({ where: { id: paymentId }, include: { company: true, invoice: true } });
  if (!p || !COUNTED.includes(p.status)) return;
  const partial = p.invoice && dec(p.invoice.total) - dec(p.invoice.amountSettled) > 0.005;
  await notify({
    type: partial ? "PARTIAL_PAYMENT" : "PAYMENT_RECEIVED",
    title: `${partial ? "Partial payment" : "Payment received"} from ${p.company.name}`,
    body: `${formatMoney(dec(p.bankCredit), p.currency)} credited${p.invoice ? ` against ${p.invoice.invoiceNumber}` : ""}${partial ? ` · ${formatMoney(dec(p.invoice!.total) - dec(p.invoice!.amountSettled), p.currency)} still due` : ""}`,
    link: p.invoice ? `/invoices/${p.invoice.id}` : `/payments`,
    permission: "payment.read",
    excludeUserId: actor.userId,
    dedupeKey: `payment:${p.id}:${p.status}`,
  });
}

export async function createPayment(input: PaymentData, actor: Actor) {
  const { company, projectId } = await validate(input);
  const p = await prisma.$transaction(async (tx) => {
    const created = await tx.payment.create({ data: { ...toData(input, projectId), createdById: actor.userId } });
    if (created.invoiceId) await recomputeInvoice(created.invoiceId, tx);
    await audit(actor, {
      action: "payment.recorded", entity: "Payment", entityId: created.id,
      newValue: { company: company.name, amountReceived: input.amountReceived, tds: input.tdsDeducted, bankCredit: created.bankCredit, status: input.status },
    }, tx);
    return created;
  });
  await announce(p.id, actor);
  return p;
}

export async function updatePayment(id: string, input: PaymentData, actor: Actor) {
  const before = await prisma.payment.findFirst({ where: { id, deletedAt: null } });
  if (!before) throw notFound("Payment");
  const { projectId } = await validate(input, id);
  const after = await prisma.$transaction(async (tx) => {
    const updated = await tx.payment.update({ where: { id }, data: toData(input, projectId) });
    for (const invId of new Set([before.invoiceId, updated.invoiceId])) if (invId) await recomputeInvoice(invId, tx);
    const d = diff(before, updated);
    if (d.changed) await audit(actor, { action: "payment.updated", entity: "Payment", entityId: id, oldValue: d.oldValue, newValue: d.newValue }, tx);
    return updated;
  });
  if (before.status !== after.status) await announce(id, actor);
  return after;
}

export async function reconcilePayment(id: string, actor: Actor) {
  const p = await prisma.payment.findFirst({ where: { id, deletedAt: null } });
  if (!p) throw notFound("Payment");
  if (p.status !== "RECEIVED") throw badRequest("Only received payments can be reconciled.");
  await prisma.payment.update({ where: { id }, data: { status: "RECONCILED" } });
  await audit(actor, { action: "payment.reconciled", entity: "Payment", entityId: id });
}

export async function archivePayment(id: string, actor: Actor) {
  const p = await prisma.payment.findFirst({ where: { id, deletedAt: null } });
  if (!p) throw notFound("Payment");
  await prisma.$transaction(async (tx) => {
    await tx.payment.update({ where: { id }, data: { deletedAt: new Date() } });
    if (p.invoiceId) await recomputeInvoice(p.invoiceId, tx);
    await audit(actor, { action: "payment.archived", entity: "Payment", entityId: id, oldValue: { amountReceived: p.amountReceived, bankCredit: p.bankCredit, status: p.status } }, tx);
  });
}

/**
 * The monthly payment tracker: one row per issued invoice with what was expected,
 * settled, credited to the bank, and still outstanding.
 */
export async function paymentTracker(q: ListQuery) {
  await syncOverdueInvoices();
  const where: Prisma.InvoiceWhereInput = { deletedAt: null, status: { notIn: ["DRAFT", "CANCELLED"] } };
  if (q.companyId) where.companyId = String(q.companyId);
  if (q.projectId) where.projectId = String(q.projectId);
  if (q.month) where.billingMonth = String(q.month);
  else if (q.year) where.billingMonth = { startsWith: `${q.year}-` };
  if (q.q) where.OR = [
    { invoiceNumber: { contains: q.q, mode: "insensitive" } },
    { company: { name: { contains: q.q, mode: "insensitive" } } },
    { project: { name: { contains: q.q, mode: "insensitive" } } },
  ];
  const today = parseDateOnly(todayDateOnly());
  const status = String(q.status ?? "");
  if (status === "PAID") where.status = "PAID";
  if (status === "OVERDUE") where.status = "OVERDUE";
  if (status === "PARTIAL") where.AND = [{ status: { in: ["PARTIALLY_PAID", "OVERDUE"] } }, { amountSettled: { gt: 0 } }];
  if (status === "PENDING") where.AND = [{ status: { in: ["SENT"] } }, { amountSettled: 0 }, { dueDate: { gte: today } }];
  if (q.from || q.to) where.payments = {
    some: {
      deletedAt: null,
      paymentDate: { ...(q.from ? { gte: parseDateOnly(String(q.from)) } : {}), ...(q.to ? { lte: parseDateOnly(String(q.to)) } : {}) },
    },
  };

  const all = await prisma.invoice.findMany({
    where,
    include: {
      company: { select: { id: true, name: true } },
      project: { select: { id: true, name: true, code: true } },
      payments: {
        where: { deletedAt: null },
        select: { bankCredit: true, tdsDeducted: true, otherDeduction: true, status: true, paymentDate: true },
      },
    },
    orderBy: orderBy(q, {
      company: (d) => ({ company: { name: d } }),
      month: (d) => ({ billingMonth: d }),
      invoice: (d) => ({ total: d }),
      dueDate: (d) => ({ dueDate: d }),
    }, [{ billingMonth: "desc" }, { company: { name: "asc" } }] as Prisma.InvoiceOrderByWithRelationInput[]),
  });

  const rows = all.map((i) => {
    const counted = i.payments.filter((p) => COUNTED.includes(p.status));
    const total = dec(i.total);
    const settled = dec(i.amountSettled);
    const outstanding = round2(Math.max(total - settled, 0));
    const lastPayment = counted.map((p) => dateOnly(p.paymentDate)).sort().at(-1) ?? null;
    const trackerStatus = outstanding <= 0.005 ? "PAID" : i.status === "OVERDUE" ? "OVERDUE" : settled > 0 ? "PARTIAL" : "PENDING";
    return {
      id: i.id,
      invoiceNumber: i.invoiceNumber,
      company: i.company,
      project: i.project,
      month: i.billingMonth,
      dueDate: dateOnly(i.dueDate),
      currency: i.currency,
      rate: dec(i.exchangeRate) || 1,
      invoiced: dec(i.subtotal),
      expected: total,
      received: settled,
      deductions: round2(counted.reduce((s, p) => s + dec(p.tdsDeducted) + dec(p.otherDeduction), 0)),
      bankCredit: round2(counted.reduce((s, p) => s + dec(p.bankCredit), 0)),
      outstanding,
      lastPayment,
      pendingPayments: i.payments.filter((p) => p.status === "PENDING").length,
      status: trackerStatus,
    };
  });

  const base = (n: number, r: number) => n * r;
  const summary = {
    invoiced: round2(rows.reduce((s, r) => s + base(r.expected, r.rate), 0)),
    received: round2(rows.reduce((s, r) => s + base(r.received, r.rate), 0)),
    bankCredit: round2(rows.reduce((s, r) => s + base(r.bankCredit, r.rate), 0)),
    deductions: round2(rows.reduce((s, r) => s + base(r.deductions, r.rate), 0)),
    outstanding: round2(rows.reduce((s, r) => s + base(r.outstanding, r.rate), 0)),
    overdue: round2(rows.filter((r) => r.status === "OVERDUE").reduce((s, r) => s + base(r.outstanding, r.rate), 0)),
    counts: {
      PAID: rows.filter((r) => r.status === "PAID").length,
      PARTIAL: rows.filter((r) => r.status === "PARTIAL").length,
      PENDING: rows.filter((r) => r.status === "PENDING").length,
      OVERDUE: rows.filter((r) => r.status === "OVERDUE").length,
    },
  };

  const start = (q.page - 1) * q.pageSize;
  return { data: rows.slice(start, start + q.pageSize), total: rows.length, page: q.page, pageSize: q.pageSize, summary };
}
