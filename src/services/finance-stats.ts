import "server-only";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { round2 } from "@/lib/money";
import { dec } from "@/lib/serialize";
import { todayDateOnly, dateOnly } from "@/lib/dates";

/**
 * Receivable figures, always in the base currency (amount × exchangeRate).
 *   invoiced    — issued invoices (not draft, not cancelled)
 *   received    — amount settled against them by received/reconciled payments (TDS included)
 *   outstanding — invoiced − received
 *   overdue     — outstanding on invoices past their due date
 * Cash that actually reached the bank is reported separately (bankCredit on Payment).
 */
export const ISSUED: Prisma.InvoiceWhereInput = { deletedAt: null, status: { notIn: ["DRAFT", "CANCELLED"] } };

export type InvoiceLite = {
  id: string;
  total: number;
  settled: number;
  outstanding: number;
  rate: number;
  status: string;
  dueDate: string;
  billingMonth: string | null;
  companyId: string;
  projectId: string | null;
  isOverdue: boolean;
};

export async function issuedInvoices(where: Prisma.InvoiceWhereInput = {}): Promise<InvoiceLite[]> {
  const today = todayDateOnly();
  const rows = await prisma.invoice.findMany({
    where: { AND: [ISSUED, where] },
    select: { id: true, total: true, amountSettled: true, exchangeRate: true, status: true, dueDate: true, billingMonth: true, companyId: true, projectId: true },
  });
  return rows.map((r) => {
    const total = dec(r.total);
    const settled = dec(r.amountSettled);
    const outstanding = round2(Math.max(total - settled, 0));
    const due = dateOnly(r.dueDate);
    return {
      id: r.id, total, settled, outstanding, rate: dec(r.exchangeRate) || 1, status: r.status, dueDate: due,
      billingMonth: r.billingMonth, companyId: r.companyId, projectId: r.projectId,
      isOverdue: outstanding > 0.005 && due < today,
    };
  });
}

export function sumInvoices(list: InvoiceLite[]) {
  let invoiced = 0, received = 0, outstanding = 0, overdue = 0, overdueCount = 0, pendingCount = 0;
  for (const i of list) {
    invoiced += i.total * i.rate;
    received += i.settled * i.rate;
    outstanding += i.outstanding * i.rate;
    if (i.isOverdue) { overdue += i.outstanding * i.rate; overdueCount++; }
    else if (i.outstanding > 0.005) pendingCount++;
  }
  return {
    invoiced: round2(invoiced), received: round2(received), outstanding: round2(outstanding),
    overdue: round2(overdue), overdueCount, pendingCount, count: list.length,
  };
}

/** Cash that reached the bank from client payments. */
export async function bankCredits(where: Prisma.PaymentWhereInput = {}) {
  const rows = await prisma.payment.findMany({
    where: { AND: [{ deletedAt: null, status: { in: ["RECEIVED", "RECONCILED"] } }, where] },
    select: { bankCredit: true, amountReceived: true, tdsDeducted: true, otherDeduction: true, exchangeRate: true, paymentDate: true, companyId: true, projectId: true },
  });
  return rows.map((r) => {
    const rate = dec(r.exchangeRate) || 1;
    return {
      bankCredit: dec(r.bankCredit) * rate,
      settled: dec(r.amountReceived) * rate,
      tds: dec(r.tdsDeducted) * rate,
      other: dec(r.otherDeduction) * rate,
      month: dateOnly(r.paymentDate).slice(0, 7),
      companyId: r.companyId,
      projectId: r.projectId,
    };
  });
}

/** Month-by-month invoiced vs received, keyed by billing month. */
export function byBillingMonth(list: InvoiceLite[]) {
  const map = new Map<string, { month: string; invoiced: number; received: number; outstanding: number; overdue: boolean; count: number }>();
  for (const i of list) {
    const m = i.billingMonth ?? i.dueDate.slice(0, 7);
    const row = map.get(m) ?? { month: m, invoiced: 0, received: 0, outstanding: 0, overdue: false, count: 0 };
    row.invoiced += i.total * i.rate;
    row.received += i.settled * i.rate;
    row.outstanding += i.outstanding * i.rate;
    row.overdue ||= i.isOverdue;
    row.count++;
    map.set(m, row);
  }
  return [...map.values()]
    .map((r) => ({
      ...r,
      invoiced: round2(r.invoiced), received: round2(r.received), outstanding: round2(r.outstanding),
      status: r.outstanding < 0.005 ? "PAID" : r.overdue ? "OVERDUE" : r.received > 0 ? "PARTIAL" : "PENDING",
    }))
    .sort((a, b) => b.month.localeCompare(a.month));
}
