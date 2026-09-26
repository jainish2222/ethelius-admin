import "server-only";
import { prisma } from "@/lib/prisma";
import { round2 } from "@/lib/money";
import { dec } from "@/lib/serialize";
import { currentMonth, dateOnly, daysInMonth, monthBounds, monthRange, type Month } from "@/lib/dates";
import { issuedInvoices, bankCredits } from "./finance-stats";

export type Profitability = {
  projectId: string;
  expectedRevenue: number; // invoiced
  receivedRevenue: number; // settled against invoices
  bankCredited: number; // cash that reached the bank
  employeeCost: number;
  expenses: number;
  expectedMargin: number;
  actualMargin: number;
  expectedMarginPct: number | null;
  actualMarginPct: number | null;
  months: { month: Month; revenue: number; received: number; cost: number; expenses: number }[];
};

/**
 * Project profitability in the base currency.
 * Employee cost for a month = that employee's payroll employer cost × allocation %, pro-rated by
 * how many days of the month the assignment covered. Where no payroll exists yet, the
 * assignment's own monthly employee-cost estimate is used instead.
 */
export async function projectProfitability(projectIds: string[], range?: { from?: Month; to?: Month }): Promise<Map<string, Profitability>> {
  const out = new Map<string, Profitability>();
  if (!projectIds.length) return out;

  const to = range?.to ?? currentMonth();
  const monthFilter = { gte: range?.from ?? "0000-00", lte: to };

  const [projects, assignments, invoices, credits, expenses] = await Promise.all([
    prisma.project.findMany({ where: { id: { in: projectIds } }, select: { id: true, startDate: true } }),
    prisma.projectAssignment.findMany({
      where: { projectId: { in: projectIds }, status: { in: ["ACTIVE", "ENDED"] } },
      select: { projectId: true, employeeId: true, startDate: true, endDate: true, allocationPercent: true, employeeCost: true },
    }),
    issuedInvoices({ projectId: { in: projectIds }, billingMonth: monthFilter }),
    bankCredits({ projectId: { in: projectIds } }),
    prisma.expense.findMany({
      where: { projectId: { in: projectIds }, deletedAt: null, status: { in: ["APPROVED", "PAID"] } },
      select: { projectId: true, amount: true, date: true },
    }),
  ]);

  const employeeIds = [...new Set(assignments.map((a) => a.employeeId))];
  const payrolls = await prisma.payroll.findMany({
    where: { employeeId: { in: employeeIds }, deletedAt: null, status: { notIn: ["CANCELLED", "DRAFT"] }, month: monthFilter },
    select: { employeeId: true, month: true, employerCost: true },
  });
  const payrollCost = new Map(payrolls.map((p) => [`${p.employeeId}|${p.month}`, dec(p.employerCost)]));

  for (const p of projects) {
    const from = range?.from ?? dateOnly(p.startDate).slice(0, 7);
    const months = from <= to ? monthRange(from, to) : [];
    const perMonth = new Map(months.map((m) => [m, { month: m, revenue: 0, received: 0, cost: 0, expenses: 0 }]));

    for (const inv of invoices.filter((i) => i.projectId === p.id)) {
      const row = perMonth.get(inv.billingMonth ?? inv.dueDate.slice(0, 7));
      if (row) { row.revenue += inv.total * inv.rate; row.received += inv.settled * inv.rate; }
    }

    for (const a of assignments.filter((x) => x.projectId === p.id)) {
      const aStart = dateOnly(a.startDate);
      const aEnd = a.endDate ? dateOnly(a.endDate) : "9999-12-31";
      for (const m of months) {
        const { start, end } = monthBounds(m);
        const mStart = dateOnly(start), mEnd = dateOnly(end);
        if (aStart > mEnd || aEnd < mStart) continue;
        const s = aStart > mStart ? aStart : mStart;
        const e = aEnd < mEnd ? aEnd : mEnd;
        const coveredDays = (Date.parse(e) - Date.parse(s)) / 86400000 + 1;
        const fraction = coveredDays / daysInMonth(m);
        const monthly = payrollCost.get(`${a.employeeId}|${m}`) ?? dec(a.employeeCost);
        perMonth.get(m)!.cost += monthly * (a.allocationPercent / 100) * fraction;
      }
    }

    for (const x of expenses.filter((e) => e.projectId === p.id)) {
      const row = perMonth.get(dateOnly(x.date).slice(0, 7));
      if (row) row.expenses += dec(x.amount);
    }

    const rows = [...perMonth.values()].map((r) => ({
      month: r.month, revenue: round2(r.revenue), received: round2(r.received), cost: round2(r.cost), expenses: round2(r.expenses),
    }));
    const expectedRevenue = round2(rows.reduce((s, r) => s + r.revenue, 0));
    const receivedRevenue = round2(rows.reduce((s, r) => s + r.received, 0));
    const employeeCost = round2(rows.reduce((s, r) => s + r.cost, 0));
    const expenseTotal = round2(rows.reduce((s, r) => s + r.expenses, 0));
    const expectedMargin = round2(expectedRevenue - employeeCost - expenseTotal);
    const actualMargin = round2(receivedRevenue - employeeCost - expenseTotal);
    out.set(p.id, {
      projectId: p.id,
      expectedRevenue,
      receivedRevenue,
      bankCredited: round2(credits.filter((c) => c.projectId === p.id && c.month >= (range?.from ?? "0000-00") && c.month <= to).reduce((s, c) => s + c.bankCredit, 0)),
      employeeCost,
      expenses: expenseTotal,
      expectedMargin,
      actualMargin,
      expectedMarginPct: expectedRevenue ? round2((expectedMargin / expectedRevenue) * 100) : null,
      actualMarginPct: receivedRevenue ? round2((actualMargin / receivedRevenue) * 100) : null,
      months: rows,
    });
  }
  return out;
}
