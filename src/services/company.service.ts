import "server-only";
import type { z } from "zod";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { audit, diff } from "@/lib/audit";
import { actorCan, type Actor } from "@/lib/api/handler";
import { conflict, notFound } from "@/lib/api/errors";
import { csv, orderBy, paging, type ListQuery } from "@/lib/api/list-query";
import { dateOnly, parseDateOnly, todayDateOnly } from "@/lib/dates";
import type { companySchema, companyContactSchema } from "@/validations/business";
import { byBillingMonth, issuedInvoices, sumInvoices, bankCredits } from "./finance-stats";

type CompanyData = z.output<typeof companySchema>;
type ContactData = z.output<typeof companyContactSchema>;

const toData = (i: CompanyData) => ({
  ...i,
  gstNumber: i.gstNumber?.toUpperCase() ?? null,
  pan: i.pan?.toUpperCase() ?? null,
  contractStart: i.contractStart ? parseDateOnly(i.contractStart) : null,
  contractEnd: i.contractEnd ? parseDateOnly(i.contractEnd) : null,
  customPaymentDays: i.paymentTerms === "CUSTOM" ? i.customPaymentDays : null,
});

export async function listCompanies(q: ListQuery, actor: Actor) {
  const where: Prisma.CompanyWhereInput = { deletedAt: null };
  if (q.q) where.OR = [
    { name: { contains: q.q, mode: "insensitive" } },
    { legalName: { contains: q.q, mode: "insensitive" } },
    { gstNumber: { contains: q.q, mode: "insensitive" } },
    { billingEmail: { contains: q.q, mode: "insensitive" } },
  ];
  const statuses = csv(q.status);
  if (statuses.length) where.status = { in: statuses as never };
  if (q.type) where.type = q.type as never;

  const [rows, total] = await Promise.all([
    prisma.company.findMany({
      where,
      orderBy: orderBy(q, {
        name: (d) => ({ name: d }),
        status: (d) => ({ status: d }),
        contractEnd: (d) => ({ contractEnd: d }),
        createdAt: (d) => ({ createdAt: d }),
      }, { name: "asc" } as Prisma.CompanyOrderByWithRelationInput),
      ...paging(q),
      include: { _count: { select: { projects: { where: { deletedAt: null } } } } },
    }),
    prisma.company.count({ where }),
  ]);

  const finance = actorCan(actor, "billing.read");
  const invoices = finance ? await issuedInvoices({ companyId: { in: rows.map((r) => r.id) } }) : [];
  const today = todayDateOnly();
  const headcounts = await prisma.projectAssignment.groupBy({
    by: ["projectId"],
    where: { status: "ACTIVE", project: { companyId: { in: rows.map((r) => r.id) } }, OR: [{ endDate: null }, { endDate: { gte: parseDateOnly(today) } }] },
    _count: { employeeId: true },
  });
  const projectCompany = new Map(
    (await prisma.project.findMany({ where: { id: { in: headcounts.map((h) => h.projectId) } }, select: { id: true, companyId: true } }))
      .map((p) => [p.id, p.companyId]),
  );

  return {
    total, page: q.page, pageSize: q.pageSize,
    data: rows.map((c) => {
      const stats = finance ? sumInvoices(invoices.filter((i) => i.companyId === c.id)) : null;
      return {
        id: c.id, name: c.name, legalName: c.legalName, type: c.type, status: c.status,
        billingContactName: c.billingContactName, billingEmail: c.billingEmail, phone: c.phone,
        paymentTerms: c.paymentTerms, currency: c.currency,
        contractStart: dateOnly(c.contractStart), contractEnd: dateOnly(c.contractEnd),
        projectCount: c._count.projects,
        employeeCount: headcounts.filter((h) => projectCompany.get(h.projectId) === c.id).reduce((s, h) => s + h._count.employeeId, 0),
        invoiced: stats?.invoiced ?? null,
        received: stats?.received ?? null,
        outstanding: stats?.outstanding ?? null,
        overdue: stats?.overdue ?? null,
      };
    }),
  };
}

export async function getCompany(id: string, actor: Actor) {
  const c = await prisma.company.findFirst({
    where: { id, deletedAt: null },
    include: {
      contacts: { orderBy: [{ isPrimary: "desc" }, { name: "asc" }] },
      projects: {
        where: { deletedAt: null },
        orderBy: [{ status: "asc" }, { name: "asc" }],
        include: {
          manager: { select: { id: true, fullName: true } },
          _count: { select: { assignments: { where: { status: "ACTIVE" } } } },
        },
      },
    },
  });
  if (!c) throw notFound("Company");

  const finance = actorCan(actor, "billing.read");
  let finances = null;
  if (finance) {
    const invoices = await issuedInvoices({ companyId: id });
    const credits = await bankCredits({ companyId: id });
    const totals = sumInvoices(invoices);
    const history = byBillingMonth(invoices);
    finances = {
      ...totals,
      bankCredited: credits.reduce((s, r) => s + r.bankCredit, 0),
      tdsDeducted: credits.reduce((s, r) => s + r.tds, 0),
      monthlyRevenue: c.projects
        .filter((p) => p.status === "ACTIVE" && p.billingType === "MONTHLY")
        .reduce((s, p) => s + Number(p.monthlyBillingAmount ?? 0), 0),
      history,
    };
  }

  return {
    ...c,
    contractStart: dateOnly(c.contractStart),
    contractEnd: dateOnly(c.contractEnd),
    projects: c.projects.map((p) => ({ ...p, startDate: dateOnly(p.startDate), endDate: dateOnly(p.endDate), headcount: p._count.assignments })),
    finances,
  };
}

export async function createCompany(input: CompanyData, actor: Actor) {
  const c = await prisma.company.create({ data: toData(input) });
  await audit(actor, { action: "company.created", entity: "Company", entityId: c.id, newValue: c });
  return c;
}

export async function updateCompany(id: string, input: CompanyData, actor: Actor) {
  const before = await prisma.company.findFirst({ where: { id, deletedAt: null } });
  if (!before) throw notFound("Company");
  const after = await prisma.company.update({ where: { id }, data: toData(input) });
  const d = diff(before, after);
  if (d.changed) await audit(actor, { action: "company.updated", entity: "Company", entityId: id, oldValue: d.oldValue, newValue: d.newValue });
  return after;
}

export async function archiveCompany(id: string, actor: Actor) {
  const c = await prisma.company.findFirst({ where: { id, deletedAt: null }, include: { projects: { where: { deletedAt: null, status: "ACTIVE" }, select: { id: true } } } });
  if (!c) throw notFound("Company");
  if (c.projects.length) throw conflict("This company still has active projects. Complete or archive them first.");
  await prisma.company.update({ where: { id }, data: { deletedAt: new Date(), status: "INACTIVE" } });
  await audit(actor, { action: "company.archived", entity: "Company", entityId: id });
}

export async function addContact(companyId: string, input: ContactData, actor: Actor) {
  const c = await prisma.$transaction(async (tx) => {
    if (input.isPrimary) await tx.companyContact.updateMany({ where: { companyId }, data: { isPrimary: false } });
    return tx.companyContact.create({ data: { ...input, companyId } });
  });
  await audit(actor, { action: "company.contact_added", entity: "CompanyContact", entityId: c.id, newValue: c });
  return c;
}

export async function removeContact(companyId: string, contactId: string, actor: Actor) {
  const c = await prisma.companyContact.findFirst({ where: { id: contactId, companyId } });
  if (!c) throw notFound("Contact");
  await prisma.companyContact.delete({ where: { id: contactId } });
  await audit(actor, { action: "company.contact_removed", entity: "CompanyContact", entityId: contactId, oldValue: c });
}

export const companyOptions = () =>
  prisma.company.findMany({
    where: { deletedAt: null },
    select: { id: true, name: true, currency: true, paymentTerms: true, customPaymentDays: true, status: true },
    orderBy: { name: "asc" },
  });
