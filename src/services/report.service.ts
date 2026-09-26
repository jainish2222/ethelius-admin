import "server-only";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import type { ListQuery } from "@/lib/api/list-query";
import { dateOnly, monthBounds } from "@/lib/dates";
import { round2 } from "@/lib/money";
import { dec } from "@/lib/serialize";
import { projectProfitability } from "./profitability";
import { syncOverdueInvoices } from "./invoice.service";

const monthWhere = (q: ListQuery) =>
  q.fromMonth || q.toMonth
    ? { ...(q.fromMonth ? { gte: String(q.fromMonth) } : {}), ...(q.toMonth ? { lte: String(q.toMonth) } : {}) }
    : undefined;

function page<T>(rows: T[], q: ListQuery) {
  const start = (q.page - 1) * q.pageSize;
  return { data: rows.slice(start, start + q.pageSize), total: rows.length, page: q.page, pageSize: q.pageSize };
}

/** Revenue: invoiced vs received vs outstanding per company, project and billing month. */
export async function revenueReport(q: ListQuery) {
  await syncOverdueInvoices();
  const where: Prisma.InvoiceWhereInput = { deletedAt: null, status: { notIn: ["DRAFT", "CANCELLED"] } };
  if (q.companyId) where.companyId = String(q.companyId);
  if (q.projectId) where.projectId = String(q.projectId);
  const mw = monthWhere(q);
  if (mw) where.billingMonth = mw;
  const invoices = await prisma.invoice.findMany({
    where,
    include: { company: { select: { id: true, name: true } }, project: { select: { id: true, name: true } } },
  });

  const groups = new Map<string, { company: string; companyId: string; project: string; projectId: string | null; month: string; invoices: number; invoiceAmount: number; tax: number; total: number; received: number; outstanding: number }>();
  for (const i of invoices) {
    const key = `${i.companyId}|${i.projectId ?? "-"}|${i.billingMonth ?? "-"}`;
    const r = dec(i.exchangeRate) || 1;
    const g = groups.get(key) ?? {
      company: i.company.name, companyId: i.companyId, project: i.project?.name ?? "—", projectId: i.projectId,
      month: i.billingMonth ?? dateOnly(i.invoiceDate).slice(0, 7), invoices: 0, invoiceAmount: 0, tax: 0, total: 0, received: 0, outstanding: 0,
    };
    g.invoices++;
    g.invoiceAmount += (dec(i.subtotal) - dec(i.discountAmount)) * r;
    g.tax += dec(i.taxAmount) * r;
    g.total += dec(i.total) * r;
    g.received += dec(i.amountSettled) * r;
    g.outstanding += Math.max(dec(i.total) - dec(i.amountSettled), 0) * r;
    groups.set(key, g);
  }
  const needle = q.q ? String(q.q).toLowerCase() : "";
  const rows = [...groups.values()]
    .filter((g) => !needle || g.company.toLowerCase().includes(needle) || g.project.toLowerCase().includes(needle))
    .map((g) => ({ ...g, invoiceAmount: round2(g.invoiceAmount), tax: round2(g.tax), total: round2(g.total), received: round2(g.received), outstanding: round2(g.outstanding) }))
    .sort((a, b) => b.month.localeCompare(a.month) || a.company.localeCompare(b.company) || a.project.localeCompare(b.project));
  const summary = {
    invoiceAmount: round2(rows.reduce((s, r) => s + r.invoiceAmount, 0)),
    total: round2(rows.reduce((s, r) => s + r.total, 0)),
    received: round2(rows.reduce((s, r) => s + r.received, 0)),
    outstanding: round2(rows.reduce((s, r) => s + r.outstanding, 0)),
  };
  return { ...page(rows, q), summary };
}

/** Payroll register: one row per employee-month with the project they were mostly on. */
export async function payrollReport(q: ListQuery) {
  const where: Prisma.PayrollWhereInput = { deletedAt: null, status: { not: "CANCELLED" } };
  const mw = monthWhere(q);
  if (mw) where.month = mw;
  if (q.month) where.month = String(q.month);
  if (q.employeeId) where.employeeId = String(q.employeeId);
  const statuses = String(q.status ?? "").split(",").filter(Boolean);
  if (statuses.length) where.status = { in: statuses as never };

  const rows = await prisma.payroll.findMany({
    where,
    orderBy: [{ month: "desc" }, { employee: { fullName: "asc" } }],
    include: {
      employee: { select: { id: true, fullName: true, employeeCode: true, department: true } },
      deductions: { select: { code: true, amount: true } },
    },
  });
  const assignments = await prisma.projectAssignment.findMany({
    where: { employeeId: { in: [...new Set(rows.map((r) => r.employeeId))] }, status: { in: ["ACTIVE", "ENDED"] } },
    include: { project: { select: { id: true, name: true, companyId: true, company: { select: { name: true } } } } },
  });

  const projectFor = (employeeId: string, month: string) => {
    const { start, end } = monthBounds(month);
    return assignments
      .filter((a) => a.employeeId === employeeId && a.startDate <= end && (!a.endDate || a.endDate >= start))
      .sort((a, b) => b.allocationPercent - a.allocationPercent)[0]?.project ?? null;
  };
  const code = (d: { code: string; amount: unknown }[], c: string) => d.filter((x) => x.code === c).reduce((s, x) => s + dec(x.amount), 0);

  let out = rows.map((p) => {
    const project = projectFor(p.employeeId, p.month);
    const pf = code(p.deductions, "PF"), pt = code(p.deductions, "PT"), tds = code(p.deductions, "TDS");
    return {
      id: p.id, month: p.month, status: p.status, paymentStatus: p.paymentStatus,
      employee: p.employee.fullName, employeeCode: p.employee.employeeCode, employeeId: p.employeeId, department: p.employee.department,
      project: project?.name ?? "Bench", projectId: project?.id ?? null, company: project?.company.name ?? "—", companyId: project?.companyId ?? null,
      gross: dec(p.grossEarnings), pf, pt, tds,
      otherDeductions: round2(dec(p.totalDeductions) - pf - pt - tds),
      totalDeductions: dec(p.totalDeductions),
      net: dec(p.netSalary),
      bankCredit: p.actualBankCredit == null ? null : dec(p.actualBankCredit),
      creditDate: dateOnly(p.bankCreditDate),
      employerCost: dec(p.employerCost),
    };
  });
  if (q.projectId) out = out.filter((r) => r.projectId === q.projectId);
  if (q.companyId) out = out.filter((r) => r.companyId === q.companyId);
  if (q.q) {
    const n = String(q.q).toLowerCase();
    out = out.filter((r) => r.employee.toLowerCase().includes(n) || r.employeeCode.toLowerCase().includes(n));
  }
  const sum = (k: "gross" | "pf" | "pt" | "tds" | "totalDeductions" | "net" | "employerCost") => round2(out.reduce((s, r) => s + r[k], 0));
  return {
    ...page(out, q),
    summary: {
      gross: sum("gross"), pf: sum("pf"), pt: sum("pt"), tds: sum("tds"), deductions: sum("totalDeductions"), net: sum("net"),
      bankCredit: round2(out.reduce((s, r) => s + (r.bankCredit ?? 0), 0)), employerCost: sum("employerCost"),
    },
  };
}

/** Project profitability: expected (invoiced) and actual (received) against cost. */
export async function profitabilityReport(q: ListQuery) {
  const where: Prisma.ProjectWhereInput = { deletedAt: null };
  if (q.companyId) where.companyId = String(q.companyId);
  if (q.projectId) where.id = String(q.projectId);
  const statuses = String(q.status ?? "").split(",").filter(Boolean);
  if (statuses.length) where.status = { in: statuses as never };
  const projects = await prisma.project.findMany({
    where,
    select: { id: true, name: true, code: true, status: true, company: { select: { id: true, name: true } }, _count: { select: { assignments: { where: { status: "ACTIVE" } } } } },
    orderBy: { name: "asc" },
  });
  const range = { from: q.fromMonth ? String(q.fromMonth) : undefined, to: q.toMonth ? String(q.toMonth) : undefined };
  const stats = await projectProfitability(projects.map((p) => p.id), range);
  const needle = q.q ? String(q.q).toLowerCase() : "";
  const rows = projects.filter((p) => !needle || p.name.toLowerCase().includes(needle) || p.company.name.toLowerCase().includes(needle) || p.code.toLowerCase().includes(needle)).map((p) => {
    const s = stats.get(p.id)!;
    const { months: _m, ...rest } = s;
    return { id: p.id, project: p.name, code: p.code, status: p.status, company: p.company.name, companyId: p.company.id, headcount: p._count.assignments, ...rest };
  }).sort((a, b) => b.expectedRevenue - a.expectedRevenue);

  const sum = (k: "expectedRevenue" | "receivedRevenue" | "employeeCost" | "expenses" | "expectedMargin" | "actualMargin" | "bankCredited") => round2(rows.reduce((s, r) => s + r[k], 0));
  const summary = {
    expectedRevenue: sum("expectedRevenue"), receivedRevenue: sum("receivedRevenue"), bankCredited: sum("bankCredited"),
    employeeCost: sum("employeeCost"), expenses: sum("expenses"), expectedMargin: sum("expectedMargin"), actualMargin: sum("actualMargin"),
  };
  return {
    ...page(rows, q),
    summary: {
      ...summary,
      expectedMarginPct: summary.expectedRevenue ? round2((summary.expectedMargin / summary.expectedRevenue) * 100) : null,
      actualMarginPct: summary.receivedRevenue ? round2((summary.actualMargin / summary.receivedRevenue) * 100) : null,
    },
  };
}
