import "server-only";
import type { z } from "zod";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { audit, diff } from "@/lib/audit";
import { actorCan, type Actor } from "@/lib/api/handler";
import { conflict, notFound } from "@/lib/api/errors";
import { csv, orderBy, paging, type ListQuery } from "@/lib/api/list-query";
import { dateOnly, parseDateOnly, todayDateOnly } from "@/lib/dates";
import { dec } from "@/lib/serialize";
import type { projectSchema } from "@/validations/business";
import { byBillingMonth, issuedInvoices, sumInvoices } from "./finance-stats";
import { projectProfitability } from "./profitability";

type ProjectData = z.output<typeof projectSchema>;

const toData = (i: ProjectData) => ({
  ...i,
  code: i.code.toUpperCase(),
  startDate: parseDateOnly(i.startDate),
  endDate: i.endDate ? parseDateOnly(i.endDate) : null,
  customPaymentDays: i.paymentTerms === "CUSTOM" ? i.customPaymentDays : null,
  monthlyBillingAmount: i.monthlyBillingAmount,
  hourlyRate: i.hourlyRate,
});

const currentAssignment = (): Prisma.ProjectAssignmentWhereInput => {
  const today = parseDateOnly(todayDateOnly());
  return { status: "ACTIVE", startDate: { lte: today }, OR: [{ endDate: null }, { endDate: { gte: today } }] };
};

export async function listProjects(q: ListQuery, actor: Actor) {
  const where: Prisma.ProjectWhereInput = { deletedAt: null };
  if (q.q) where.OR = [
    { name: { contains: q.q, mode: "insensitive" } },
    { code: { contains: q.q, mode: "insensitive" } },
    { company: { name: { contains: q.q, mode: "insensitive" } } },
  ];
  const statuses = csv(q.status);
  if (statuses.length) where.status = { in: statuses as never };
  if (q.companyId) where.companyId = String(q.companyId);
  if (q.billingType) where.billingType = q.billingType as never;
  if (q.managerId) where.managerId = String(q.managerId);

  const [rows, total] = await Promise.all([
    prisma.project.findMany({
      where,
      orderBy: orderBy(q, {
        name: (d) => ({ name: d }),
        code: (d) => ({ code: d }),
        company: (d) => ({ company: { name: d } }),
        startDate: (d) => ({ startDate: d }),
        endDate: (d) => ({ endDate: d }),
        monthlyBillingAmount: (d) => ({ monthlyBillingAmount: d }),
        status: (d) => ({ status: d }),
      }, [{ status: "asc" }, { name: "asc" }] as Prisma.ProjectOrderByWithRelationInput[]),
      ...paging(q),
      include: {
        company: { select: { id: true, name: true } },
        manager: { select: { id: true, fullName: true } },
        _count: { select: { assignments: { where: currentAssignment() } } },
      },
    }),
    prisma.project.count({ where }),
  ]);

  const finance = actorCan(actor, "billing.read");
  const invoices = finance ? await issuedInvoices({ projectId: { in: rows.map((r) => r.id) } }) : [];

  return {
    total, page: q.page, pageSize: q.pageSize,
    data: rows.map((p) => {
      const stats = finance ? sumInvoices(invoices.filter((i) => i.projectId === p.id)) : null;
      return {
        id: p.id, name: p.name, code: p.code, status: p.status,
        company: p.company, manager: p.manager,
        startDate: dateOnly(p.startDate), endDate: dateOnly(p.endDate),
        billingType: p.billingType, currency: p.currency, paymentTerms: p.paymentTerms,
        monthlyBillingAmount: finance || actorCan(actor, "report.project") ? dec(p.monthlyBillingAmount) || null : null,
        headcount: p._count.assignments,
        invoiced: stats?.invoiced ?? null,
        received: stats?.received ?? null,
        outstanding: stats?.outstanding ?? null,
      };
    }),
  };
}

export async function getProject(id: string, actor: Actor) {
  const p = await prisma.project.findFirst({
    where: { id, deletedAt: null },
    include: {
      company: { select: { id: true, name: true, currency: true } },
      manager: { select: { id: true, fullName: true, designation: true } },
      assignments: {
        orderBy: [{ status: "asc" }, { startDate: "desc" }],
        include: { employee: { select: { id: true, fullName: true, employeeCode: true, designation: true, photoPath: true } } },
      },
    },
  });
  if (!p) throw notFound("Project");

  const finance = actorCan(actor, "billing.read");
  const projectReports = finance || actorCan(actor, "report.project");
  let finances = null;
  if (finance) {
    const invoices = await issuedInvoices({ projectId: id });
    finances = { ...sumInvoices(invoices), history: byBillingMonth(invoices) };
  }
  const profit = projectReports ? (await projectProfitability([id])).get(id) ?? null : null;
  const today = todayDateOnly();
  const seeCost = actorCan(actor, "salary.read") || actorCan(actor, "report.project");

  return {
    ...p,
    startDate: dateOnly(p.startDate),
    endDate: dateOnly(p.endDate),
    monthlyBillingAmount: projectReports ? dec(p.monthlyBillingAmount) || null : null,
    hourlyRate: projectReports ? dec(p.hourlyRate) || null : null,
    assignments: p.assignments.map(({ employee: { photoPath, ...emp }, ...a }) => ({
      ...a,
      employee: { ...emp, hasPhoto: !!photoPath },
      startDate: dateOnly(a.startDate),
      endDate: dateOnly(a.endDate),
      billingRate: seeCost ? a.billingRate : null,
      employeeCost: seeCost ? a.employeeCost : null,
      isCurrent: a.status === "ACTIVE" && dateOnly(a.startDate) <= today && (!a.endDate || dateOnly(a.endDate) >= today),
    })),
    finances,
    profitability: profit,
  };
}

export async function createProject(input: ProjectData, actor: Actor) {
  const company = await prisma.company.findFirst({ where: { id: input.companyId, deletedAt: null } });
  if (!company) throw notFound("Company");
  const p = await prisma.project.create({ data: toData(input) });
  await audit(actor, { action: "project.created", entity: "Project", entityId: p.id, newValue: p });
  return p;
}

export async function updateProject(id: string, input: ProjectData, actor: Actor) {
  const before = await prisma.project.findFirst({ where: { id, deletedAt: null } });
  if (!before) throw notFound("Project");
  if (before.companyId !== input.companyId) {
    const invoiced = await prisma.invoice.count({ where: { projectId: id, deletedAt: null } });
    if (invoiced) throw conflict("This project already has invoices, so its company cannot change.");
  }
  const after = await prisma.project.update({ where: { id }, data: toData(input) });
  const d = diff(before, after);
  if (d.changed) await audit(actor, { action: "project.updated", entity: "Project", entityId: id, oldValue: d.oldValue, newValue: d.newValue });
  return after;
}

export async function archiveProject(id: string, actor: Actor) {
  const p = await prisma.project.findFirst({ where: { id, deletedAt: null } });
  if (!p) throw notFound("Project");
  const active = await prisma.projectAssignment.count({ where: { projectId: id, ...currentAssignment() } });
  if (active) throw conflict("End the project's active assignments before archiving it.");
  await prisma.project.update({ where: { id }, data: { deletedAt: new Date() } });
  await audit(actor, { action: "project.archived", entity: "Project", entityId: id });
}

export const projectOptions = () =>
  prisma.project.findMany({
    where: { deletedAt: null },
    select: {
      id: true, name: true, code: true, status: true, companyId: true, currency: true, billingType: true,
      monthlyBillingAmount: true, taxPercent: true, paymentTerms: true, customPaymentDays: true,
      company: { select: { name: true } },
    },
    orderBy: { name: "asc" },
  });
