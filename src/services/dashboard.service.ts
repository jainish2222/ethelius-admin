import "server-only";
import { prisma } from "@/lib/prisma";
import { actorCan, type Actor } from "@/lib/api/handler";
import { addDays, addMonths, currentMonth, dateOnly, monthBounds, monthRange, parseDateOnly, todayDateOnly } from "@/lib/dates";
import { round2 } from "@/lib/money";
import { dec } from "@/lib/serialize";
import { bankCredits, issuedInvoices, sumInvoices } from "./finance-stats";
import { syncOverdueInvoices } from "./invoice.service";

export async function dashboard(actor: Actor) {
  const month = currentMonth();
  const today = parseDateOnly(todayDateOnly());

  const [totalEmployees, activeEmployees, onNotice, activeCompanies, activeProjects, contractsExpiring, projectsEnding, joining] = await Promise.all([
    prisma.employee.count({ where: { deletedAt: null, status: { in: ["ACTIVE", "ON_NOTICE"] } } }),
    prisma.employee.count({ where: { deletedAt: null, status: "ACTIVE" } }),
    prisma.employee.findMany({
      where: { deletedAt: null, status: "ON_NOTICE" },
      select: { id: true, fullName: true, designation: true, exitDate: true },
      orderBy: { exitDate: "asc" },
    }),
    prisma.company.count({ where: { deletedAt: null, status: "ACTIVE" } }),
    prisma.project.count({ where: { deletedAt: null, status: "ACTIVE" } }),
    prisma.company.findMany({
      where: { deletedAt: null, status: "ACTIVE", contractEnd: { gte: today, lte: addDays(today, 60) } },
      select: { id: true, name: true, contractEnd: true },
      orderBy: { contractEnd: "asc" },
    }),
    prisma.project.findMany({
      where: { deletedAt: null, status: "ACTIVE", endDate: { gte: today, lte: addDays(today, 45) } },
      select: { id: true, name: true, endDate: true, company: { select: { name: true } } },
      orderBy: { endDate: "asc" },
    }),
    prisma.employee.count({ where: { deletedAt: null, joiningDate: { gt: today, lte: addDays(today, 30) } } }),
  ]);

  const people = {
    totalEmployees, activeEmployees, activeCompanies, activeProjects,
    employeesOnNotice: onNotice.length,
    onNotice: onNotice.map((e) => ({ ...e, exitDate: dateOnly(e.exitDate) })),
    upcomingContractExpiry: contractsExpiring.length,
    contractsExpiring: contractsExpiring.map((c) => ({ ...c, contractEnd: dateOnly(c.contractEnd) })),
    projectsEnding: projectsEnding.map((p) => ({ ...p, endDate: dateOnly(p.endDate) })),
    joiningSoon: joining,
  };

  if (!actorCan(actor, "dashboard.finance")) {
    return { month, people, finance: null, charts: null, activity: await recentActivity(actor) };
  }

  await syncOverdueInvoices();
  const from = addMonths(month, -11);
  const months = monthRange(from, month);
  const [allIssued, credits, payrollRows, projects, companies] = await Promise.all([
    issuedInvoices(),
    bankCredits({ paymentDate: { gte: monthBounds(from).start } }),
    prisma.payroll.groupBy({
      by: ["month"],
      where: { deletedAt: null, status: { not: "CANCELLED" }, month: { gte: from, lte: month } },
      _sum: { netSalary: true, grossEarnings: true, employerCost: true, actualBankCredit: true },
      _count: true,
    }),
    prisma.project.findMany({ where: { deletedAt: null }, select: { id: true, name: true, code: true } }),
    prisma.company.findMany({ where: { deletedAt: null }, select: { id: true, name: true } }),
  ]);

  const thisMonth = allIssued.filter((i) => i.billingMonth === month);
  const receivedThisMonth = credits.filter((c) => c.month === month);
  const totals = sumInvoices(allIssued);
  const latestPayroll = [...payrollRows].sort((a, b) => b.month.localeCompare(a.month))[0];
  const payrollNow = payrollRows.find((p) => p.month === month) ?? latestPayroll;

  const finance = {
    currentMonthRevenue: sumInvoices(thisMonth).invoiced,
    currentMonthReceived: round2(receivedThisMonth.reduce((s, c) => s + c.settled, 0)),
    currentMonthBankCredit: round2(receivedThisMonth.reduce((s, c) => s + c.bankCredit, 0)),
    outstanding: totals.outstanding,
    overdueAmount: totals.overdue,
    overduePayments: totals.overdueCount,
    pendingPayments: totals.pendingCount,
    payrollMonth: payrollNow?.month ?? month,
    currentMonthPayroll: round2(dec(payrollNow?._sum.netSalary)),
    payrollHeadcount: payrollNow?._count ?? 0,
  };

  const revenueTrend = months.map((m) => ({
    month: m,
    invoiced: round2(allIssued.filter((i) => i.billingMonth === m).reduce((s, i) => s + i.total * i.rate, 0)),
    received: round2(credits.filter((c) => c.month === m).reduce((s, c) => s + c.settled, 0)),
  }));
  const payrollTrend = months.map((m) => {
    const r = payrollRows.find((p) => p.month === m);
    return { month: m, net: round2(dec(r?._sum.netSalary)), gross: round2(dec(r?._sum.grossEarnings)), cost: round2(dec(r?._sum.employerCost)) };
  });

  // Start the trends at the first month that has data, so they do not open with a run of zeros.
  const firstRevenue = revenueTrend.findIndex((r) => r.invoiced || r.received);
  const firstPayroll = payrollTrend.findIndex((r) => r.net);

  // Revenue by project and by company over the last 6 billing months.
  const recent = new Set(monthRange(addMonths(month, -5), month));
  const recentInvoices = allIssued.filter((i) => i.billingMonth && recent.has(i.billingMonth));
  const byProject = new Map<string, number>();
  const byCompany = new Map<string, number>();
  for (const i of recentInvoices) {
    if (i.projectId) byProject.set(i.projectId, (byProject.get(i.projectId) ?? 0) + i.total * i.rate);
    byCompany.set(i.companyId, (byCompany.get(i.companyId) ?? 0) + i.total * i.rate);
  }
  const projectRevenue = [...byProject.entries()]
    .map(([id, v]) => ({ id, name: projects.find((p) => p.id === id)?.name ?? "—", code: projects.find((p) => p.id === id)?.code ?? "", value: round2(v) }))
    .sort((a, b) => b.value - a.value);
  const companyRevenue = [...byCompany.entries()]
    .map(([id, v]) => ({ id, name: companies.find((c) => c.id === id)?.name ?? "—", value: round2(v) }))
    .sort((a, b) => b.value - a.value);

  return {
    month, people, finance,
    charts: {
      revenueTrend: firstRevenue > 0 ? revenueTrend.slice(firstRevenue) : revenueTrend,
      payrollTrend: firstPayroll > 0 ? payrollTrend.slice(firstPayroll) : payrollTrend,
      projectRevenue, companyRevenue,
    },
    activity: await recentActivity(actor),
  };
}

async function recentActivity(actor: Actor) {
  const finance = actorCan(actor, "dashboard.finance");
  const entities = finance ? undefined : ["Employee", "Company", "Project", "ProjectAssignment", "Document", "Attendance"];
  return prisma.auditLog.findMany({
    where: {
      action: { notIn: ["auth.login", "auth.logout", "auth.login_failed", "document.viewed"] },
      ...(entities ? { entity: { in: entities } } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 12,
    select: { id: true, action: true, entity: true, entityId: true, userName: true, createdAt: true, newValue: true },
  });
}
