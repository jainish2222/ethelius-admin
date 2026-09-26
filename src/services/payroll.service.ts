import "server-only";
import type { z } from "zod";
import { prisma, type Tx } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { audit } from "@/lib/audit";
import { notify } from "@/lib/notify";
import { actorCan, requirePermission, type Actor } from "@/lib/api/handler";
import { badRequest, conflict, forbidden, notFound } from "@/lib/api/errors";
import { csv, orderBy, paging, type ListQuery } from "@/lib/api/list-query";
import { dateOnly, monthLabel, parseDateOnly, type Month } from "@/lib/dates";
import { formatMoney, maskAccount, round2 } from "@/lib/money";
import { dec } from "@/lib/serialize";
import { calculatePayroll, COMPUTED_EARNINGS, type DeductionCode, type EarningCode } from "@/features/payroll/calc";
import type { bankCreditSchema, payrollEditSchema } from "@/validations/finance";
import { defaultAttendance, employeesInMonth } from "./attendance.service";
import { structureForMonth } from "./salary.service";

type EditData = z.output<typeof payrollEditSchema>;
type CreditData = z.output<typeof bankCreditSchema>;

/** Statuses after which earnings and deductions can no longer change (Rule 9). */
export const LOCKED: string[] = ["APPROVED", "PROCESSING", "PAID"];

function scope(actor: Actor): Prisma.PayrollWhereInput {
  if (actorCan(actor, "payroll.read")) return {};
  if (actorCan(actor, "self.view") && actor.employeeId) return { employeeId: actor.employeeId, status: { in: ["APPROVED", "PROCESSING", "PAID"] } };
  throw forbidden();
}

export async function listPayroll(q: ListQuery, actor: Actor) {
  const where: Prisma.PayrollWhereInput = { deletedAt: null, ...scope(actor) };
  if (q.month) where.month = String(q.month);
  if (q.year) where.month = { startsWith: `${q.year}-` };
  if (q.employeeId) where.employeeId = String(q.employeeId);
  const statuses = csv(q.status);
  if (statuses.length) where.status = { in: statuses as never };
  const pay = csv(q.paymentStatus);
  if (pay.length) where.paymentStatus = { in: pay as never };
  if (q.projectId) where.employee = { assignments: { some: { projectId: String(q.projectId), status: { in: ["ACTIVE", "ENDED"] } } } };
  if (q.department) where.employee = { ...(where.employee as object), department: String(q.department) };
  if (q.q) where.employee = {
    ...(where.employee as object),
    OR: [
      { fullName: { contains: q.q, mode: "insensitive" } },
      { employeeCode: { contains: q.q, mode: "insensitive" } },
    ],
  };
  if (q.from || q.to) where.bankCreditDate = {
    ...(q.from ? { gte: parseDateOnly(String(q.from)) } : {}),
    ...(q.to ? { lte: parseDateOnly(String(q.to)) } : {}),
  };

  const [rows, total, sums] = await Promise.all([
    prisma.payroll.findMany({
      where,
      orderBy: orderBy(q, {
        employee: (d) => ({ employee: { fullName: d } }),
        month: (d) => ({ month: d }),
        gross: (d) => ({ grossEarnings: d }),
        net: (d) => ({ netSalary: d }),
        bankCredit: (d) => ({ actualBankCredit: d }),
        creditDate: (d) => ({ bankCreditDate: d }),
        status: (d) => ({ status: d }),
      }, [{ month: "desc" }, { employee: { fullName: "asc" } }] as Prisma.PayrollOrderByWithRelationInput[]),
      ...paging(q),
      include: {
        employee: { select: { id: true, fullName: true, employeeCode: true, designation: true, department: true } },
        payslip: { select: { id: true, payslipNumber: true } },
        deductions: { select: { code: true, amount: true } },
        bankAccount: { select: { bankName: true, accountNumber: true } },
      },
    }),
    prisma.payroll.count({ where }),
    prisma.payroll.aggregate({ where: { AND: [where, { status: { not: "CANCELLED" } }] }, _sum: { grossEarnings: true, totalDeductions: true, netSalary: true, actualBankCredit: true, employerCost: true } }),
  ]);

  const byCode = (d: { code: string; amount: unknown }[], code: string) => d.filter((x) => x.code === code).reduce((s, x) => s + dec(x.amount), 0);
  return {
    total, page: q.page, pageSize: q.pageSize,
    data: rows.map((p) => ({
      id: p.id,
      month: p.month,
      status: p.status,
      paymentStatus: p.paymentStatus,
      employee: p.employee,
      paidDays: p.paidDays,
      workingDays: p.workingDays,
      lopDays: p.lopDays,
      grossEarnings: p.grossEarnings,
      pf: byCode(p.deductions, "PF"),
      pt: byCode(p.deductions, "PT"),
      tds: byCode(p.deductions, "TDS"),
      esi: byCode(p.deductions, "ESI"),
      totalDeductions: p.totalDeductions,
      netSalary: p.netSalary,
      employerCost: p.employerCost,
      actualBankCredit: p.actualBankCredit,
      variance: p.actualBankCredit == null ? null : round2(dec(p.actualBankCredit) - dec(p.netSalary)),
      bankCreditDate: dateOnly(p.bankCreditDate),
      transactionRef: p.transactionRef,
      bankAccount: p.bankAccount ? `${p.bankAccount.bankName} ${maskAccount(p.bankAccount.accountNumber)}` : null,
      payslip: p.payslip,
    })),
    summary: {
      gross: dec(sums._sum.grossEarnings),
      deductions: dec(sums._sum.totalDeductions),
      net: dec(sums._sum.netSalary),
      credited: dec(sums._sum.actualBankCredit),
      employerCost: dec(sums._sum.employerCost),
    },
  };
}

export async function payrollMonthSummary(month: Month) {
  const [groups, eligible, attendanceCount, payslips] = await Promise.all([
    prisma.payroll.groupBy({ by: ["status"], where: { month, deletedAt: null }, _count: true, _sum: { netSalary: true, grossEarnings: true, actualBankCredit: true } }),
    employeesInMonth(month),
    prisma.attendance.count({ where: { month } }),
    prisma.payslip.count({ where: { month, deletedAt: null } }),
  ]);
  const withStructure = await prisma.salaryStructure.findMany({
    where: { employeeId: { in: eligible.map((e) => e.id) } },
    select: { employeeId: true },
    distinct: ["employeeId"],
  });
  const counts = Object.fromEntries(groups.map((g) => [g.status, g._count]));
  const active = groups.filter((g) => g.status !== "CANCELLED");
  return {
    month,
    eligible: eligible.length,
    withSalary: withStructure.length,
    attendanceRecorded: attendanceCount,
    payslips,
    generated: active.reduce((s, g) => s + g._count, 0),
    counts,
    gross: round2(active.reduce((s, g) => s + dec(g._sum.grossEarnings), 0)),
    net: round2(active.reduce((s, g) => s + dec(g._sum.netSalary), 0)),
    credited: round2(active.reduce((s, g) => s + dec(g._sum.actualBankCredit), 0)),
  };
}

export async function getPayroll(id: string, actor: Actor) {
  const p = await prisma.payroll.findFirst({
    where: { id, deletedAt: null, ...scope(actor) },
    include: {
      employee: {
        select: {
          id: true, fullName: true, employeeCode: true, designation: true, department: true, joiningDate: true,
          bankAccounts: { where: { deletedAt: null }, select: { id: true, bankName: true, accountNumber: true, isPrimary: true } },
        },
      },
      salaryStructure: true,
      items: { orderBy: { sortOrder: "asc" } },
      deductions: { orderBy: { sortOrder: "asc" } },
      bankAccount: true,
      payslip: { select: { id: true, payslipNumber: true, generatedAt: true, emailedAt: true } },
      approvedBy: { select: { name: true } },
    },
  });
  if (!p) throw notFound("Payroll");
  const attendance = await prisma.attendance.findUnique({ where: { employeeId_month: { employeeId: p.employeeId, month: p.month } } });
  const history = await prisma.auditLog.findMany({
    where: { entity: "Payroll", entityId: id },
    orderBy: { createdAt: "desc" },
    take: 20,
    select: { id: true, action: true, userName: true, createdAt: true, newValue: true },
  });
  const showBank = actorCan(actor, "employee.bank");
  return {
    ...p,
    bankCreditDate: dateOnly(p.bankCreditDate),
    employee: {
      ...p.employee,
      joiningDate: dateOnly(p.employee.joiningDate),
      bankAccounts: p.employee.bankAccounts.map((b) => ({ ...b, accountNumber: showBank ? b.accountNumber : maskAccount(b.accountNumber) })),
    },
    bankAccount: p.bankAccount ? { ...p.bankAccount, accountNumber: showBank ? p.bankAccount.accountNumber : maskAccount(p.bankAccount.accountNumber) } : null,
    attendance,
    locked: LOCKED.includes(p.status),
    history,
  };
}

/**
 * Creates draft payroll for everyone eligible in the month who has a salary structure,
 * then optionally calculates it. Existing non-cancelled payroll is left untouched.
 */
export async function generatePayroll(month: Month, employeeIds: string[] | undefined, calculate: boolean, actor: Actor) {
  const employees = await employeesInMonth(month, employeeIds);
  const existing = await prisma.payroll.findMany({ where: { month, employeeId: { in: employees.map((e) => e.id) } } });
  const byEmp = new Map(existing.map((p) => [p.employeeId, p]));

  const created: string[] = [];
  const skipped: { employee: string; reason: string }[] = [];
  for (const e of employees) {
    const current = byEmp.get(e.id);
    if (current && current.status !== "CANCELLED" && !current.deletedAt) { skipped.push({ employee: e.fullName, reason: "Already generated" }); continue; }
    const structure = await structureForMonth(e.id, month);
    if (!structure) { skipped.push({ employee: e.fullName, reason: "No salary structure for this month" }); continue; }
    const primary = await prisma.employeeBankAccount.findFirst({ where: { employeeId: e.id, deletedAt: null, isPrimary: true } });
    const row = current
      ? await prisma.payroll.update({
          where: { id: current.id },
          data: { status: "DRAFT", deletedAt: null, salaryStructureId: structure.id, bankAccountId: primary?.id ?? null, calculatedAt: null, approvedAt: null, approvedById: null },
        })
      : await prisma.payroll.create({ data: { employeeId: e.id, month, salaryStructureId: structure.id, bankAccountId: primary?.id ?? null } });
    created.push(row.id);
  }

  let calculated = 0;
  if (calculate) {
    for (const id of created) { await calculate_(id, actor, { quiet: true }); calculated++; }
    if (calculated) await announcePending(month, actor);
  }
  await audit(actor, { action: "payroll.generated", entity: "Payroll", newValue: { month, created: created.length, calculated, skipped: skipped.length } });
  return { created: created.length, calculated, skipped };
}

async function announcePending(month: Month, actor: Actor) {
  const n = await prisma.payroll.count({ where: { month, status: "CALCULATED", deletedAt: null } });
  if (!n) return;
  await notify({
    type: "PAYROLL_PENDING_APPROVAL",
    title: `Payroll for ${monthLabel(month)} is ready for approval`,
    body: `${n} employee${n === 1 ? "" : "s"} calculated and waiting.`,
    link: `/payroll?month=${month}`,
    permission: "payroll.approve",
    excludeUserId: actor.userId,
    dedupeKey: `payroll-pending:${month}:${n}`,
  });
}

/** (Re)calculates one payroll. Manual lines survive; computed lines are rebuilt. */
async function calculate_(id: string, actor: Actor, opts: { quiet?: boolean } = {}) {
  const p = await prisma.payroll.findFirst({
    where: { id, deletedAt: null },
    include: { employee: true, items: true, deductions: true },
  });
  if (!p) throw notFound("Payroll");
  if (!["DRAFT", "CALCULATED"].includes(p.status)) throw conflict(`Payroll is ${p.status.toLowerCase()} and can no longer be recalculated.`);

  const structure = (await structureForMonth(p.employeeId, p.month)) ?? (await prisma.salaryStructure.findUnique({ where: { id: p.salaryStructureId } }));
  if (!structure) throw badRequest("No salary structure is in force for this month.");
  const att = await prisma.attendance.findUnique({ where: { employeeId_month: { employeeId: p.employeeId, month: p.month } } });
  const fallback = defaultAttendance(p.month, p.employee.joiningDate, p.employee.exitDate);
  const attendance = att
    ? { workingDays: dec(att.workingDays), lopDays: dec(att.lopDays), paidDays: dec(att.workingDays) - dec(att.lopDays), overtimeHours: dec(att.overtimeHours) }
    : fallback;

  const [rules, recurring] = await Promise.all([
    prisma.deductionRule.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" } }),
    prisma.recurringDeduction.findMany({
      where: { employeeId: p.employeeId, isActive: true, startMonth: { lte: p.month }, OR: [{ endMonth: null }, { endMonth: { gte: p.month } }] },
    }),
  ]);

  const result = calculatePayroll({
    structure: {
      basic: dec(structure.basic), hra: dec(structure.hra), specialAllowance: dec(structure.specialAllowance),
      otherAllowances: dec(structure.otherAllowances), bonus: dec(structure.bonus), employerPf: dec(structure.employerPf), gratuity: dec(structure.gratuity),
    },
    attendance,
    rules: rules.map((r) => ({
      id: r.id, code: r.code, name: r.name, calcType: r.calcType, value: dec(r.value), isActive: r.isActive,
      minGross: r.minGross == null ? null : dec(r.minGross), maxGross: r.maxGross == null ? null : dec(r.maxGross), capAmount: r.capAmount == null ? null : dec(r.capAmount),
    })),
    recurring: recurring.map((r) => ({ code: r.code, label: r.label, amount: dec(r.amount) })),
    manualEarnings: p.items.filter((i) => !COMPUTED_EARNINGS.includes(i.code as EarningCode)).map((i) => ({ code: i.code as EarningCode, label: i.label, amount: dec(i.amount) })),
    manualDeductions: p.deductions.filter((d) => d.isManual).map((d) => ({ code: d.code as DeductionCode, label: d.label, amount: dec(d.amount) })),
  });

  await prisma.$transaction(async (tx) => {
    await writeLines(tx, id, result.earnings, result.deductions);
    await tx.payroll.update({
      where: { id },
      data: {
        salaryStructureId: structure.id,
        workingDays: attendance.workingDays,
        paidDays: attendance.paidDays,
        lopDays: attendance.lopDays,
        overtimeHours: attendance.overtimeHours,
        grossEarnings: result.gross,
        totalDeductions: result.totalDeductions,
        netSalary: result.net,
        employerCost: result.employerCost,
        status: "CALCULATED",
        calculatedAt: new Date(),
      },
    });
    await audit(actor, {
      action: "payroll.calculated", entity: "Payroll", entityId: id,
      oldValue: p.status === "CALCULATED" ? { gross: p.grossEarnings, net: p.netSalary } : undefined,
      newValue: { employee: p.employee.employeeCode, month: p.month, gross: result.gross, deductions: result.totalDeductions, net: result.net },
    }, tx);
  });
  if (!opts.quiet) await announcePending(p.month, actor);
}
export const calculatePayrollById = (id: string, actor: Actor) => calculate_(id, actor);

async function writeLines(
  tx: Tx, payrollId: string,
  earnings: { code: string; label: string; amount: number }[],
  deductions: { code: string; label: string; amount: number; ruleId?: string | null; isManual?: boolean }[],
) {
  await tx.payrollItem.deleteMany({ where: { payrollId } });
  await tx.payrollDeduction.deleteMany({ where: { payrollId } });
  await tx.payrollItem.createMany({ data: earnings.map((e, i) => ({ payrollId, code: e.code as EarningCode, label: e.label, amount: e.amount, sortOrder: i })) });
  await tx.payrollDeduction.createMany({
    data: deductions.map((d, i) => ({ payrollId, code: d.code as DeductionCode, label: d.label, amount: d.amount, ruleId: d.ruleId ?? null, isManual: !!d.isManual, sortOrder: i })),
  });
}

/**
 * Saves hand-edited lines (e.g. this month's TDS, a one-off deduction). Deduction lines
 * become manual so a later recalculation keeps them instead of re-applying the rule.
 */
export async function editPayrollLines(id: string, input: EditData, actor: Actor) {
  const p = await prisma.payroll.findFirst({ where: { id, deletedAt: null }, include: { items: true, deductions: true } });
  if (!p) throw notFound("Payroll");
  if (LOCKED.includes(p.status) || p.status === "CANCELLED") throw conflict("This payroll is locked. Only draft or calculated payroll can be edited.");

  const gross = input.earnings.reduce((s, e) => s + e.amount, 0);
  const ded = input.deductions.reduce((s, d) => s + d.amount, 0);
  if (ded > gross) throw badRequest("Deductions cannot exceed gross earnings.");

  const prevDed = new Map(p.deductions.map((d) => [`${d.code}|${d.label}`, d]));
  await prisma.$transaction(async (tx) => {
    await writeLines(
      tx, id,
      input.earnings,
      input.deductions.map((d) => {
        const prev = prevDed.get(`${d.code}|${d.label}`);
        const unchanged = prev && dec(prev.amount) === d.amount && !prev.isManual;
        return { ...d, ruleId: unchanged ? prev.ruleId : null, isManual: !unchanged };
      }),
    );
    const structure = await tx.salaryStructure.findUniqueOrThrow({ where: { id: p.salaryStructureId } });
    const factor = dec(p.workingDays) > 0 ? dec(p.paidDays) / dec(p.workingDays) : 1;
    await tx.payroll.update({
      where: { id },
      data: {
        grossEarnings: round2(gross),
        totalDeductions: round2(ded),
        netSalary: round2(gross - ded),
        employerCost: round2(gross + Math.round(dec(structure.employerPf) * factor) + Math.round(dec(structure.gratuity) * factor)),
        status: "CALCULATED",
        calculatedAt: p.calculatedAt ?? new Date(),
        notes: input.notes,
      },
    });
    await audit(actor, {
      action: "payroll.edited", entity: "Payroll", entityId: id,
      oldValue: { earnings: p.items.map((i) => [i.label, i.amount]), deductions: p.deductions.map((d) => [d.label, d.amount]) },
      newValue: { earnings: input.earnings.map((i) => [i.label, i.amount]), deductions: input.deductions.map((d) => [d.label, d.amount]) },
    }, tx);
  });
}

export async function changePayrollStatus(id: string, action: "calculate" | "approve" | "cancel" | "reopen", actor: Actor) {
  if (action === "calculate") return calculate_(id, actor);
  const p = await prisma.payroll.findFirst({ where: { id, deletedAt: null }, include: { employee: true } });
  if (!p) throw notFound("Payroll");

  if (action === "approve") {
    requirePermission(actor, "payroll.approve");
    if (p.status !== "CALCULATED") throw conflict("Only calculated payroll can be approved.");
    if (dec(p.netSalary) <= 0) throw badRequest("Net salary is zero or negative — review the lines before approving.");
    await prisma.payroll.update({ where: { id }, data: { status: "APPROVED", approvedAt: new Date(), approvedById: actor.userId } });
  } else if (action === "cancel") {
    if (["PROCESSING", "PAID"].includes(p.status)) throw conflict("Paid or processing payroll cannot be cancelled.");
    if (p.status === "APPROVED") requirePermission(actor, "payroll.approve");
    await prisma.payroll.update({ where: { id }, data: { status: "CANCELLED" } });
  } else {
    if (p.status !== "CANCELLED") throw conflict("Only cancelled payroll can be reopened.");
    await prisma.payroll.update({ where: { id }, data: { status: "DRAFT", approvedAt: null, approvedById: null } });
  }
  await audit(actor, {
    action: `payroll.${action === "approve" ? "approved" : action === "cancel" ? "cancelled" : "reopened"}`,
    entity: "Payroll", entityId: id,
    oldValue: { status: p.status },
    newValue: { employee: p.employee.employeeCode, month: p.month, net: p.netSalary },
  });
}

export async function bulkPayrollAction(month: Month, action: "calculate" | "approve", ids: string[] | undefined, actor: Actor) {
  if (action === "approve") requirePermission(actor, "payroll.approve");
  const targets = await prisma.payroll.findMany({
    where: {
      month, deletedAt: null,
      id: ids?.length ? { in: ids } : undefined,
      status: action === "approve" ? "CALCULATED" : { in: ["DRAFT", "CALCULATED"] },
    },
    select: { id: true },
  });
  let done = 0;
  const failed: string[] = [];
  for (const t of targets) {
    try {
      if (action === "calculate") await calculate_(t.id, actor, { quiet: true });
      else await changePayrollStatus(t.id, "approve", actor);
      done++;
    } catch (e) {
      failed.push((e as Error).message);
    }
  }
  if (action === "calculate" && done) await announcePending(month, actor);
  return { done, failed };
}

/**
 * Records what actually reached the employee's bank. It may differ from net salary
 * (e.g. an advance netted off); the difference is shown as a variance, not hidden.
 */
export async function recordBankCredit(id: string, input: CreditData, actor: Actor) {
  const p = await prisma.payroll.findFirst({ where: { id, deletedAt: null }, include: { employee: true } });
  if (!p) throw notFound("Payroll");
  if (!LOCKED.includes(p.status)) throw conflict("Approve the payroll before recording its bank credit.");
  if (input.bankAccountId) {
    const acc = await prisma.employeeBankAccount.findFirst({ where: { id: input.bankAccountId, employeeId: p.employeeId } });
    if (!acc) throw badRequest("That bank account does not belong to this employee.");
  }
  const status = input.paymentStatus === "PAID" ? "PAID" : input.paymentStatus === "PROCESSING" ? "PROCESSING" : p.status === "PAID" ? "PAID" : "APPROVED";
  const updated = await prisma.payroll.update({
    where: { id },
    data: {
      actualBankCredit: input.actualBankCredit,
      bankCreditDate: parseDateOnly(input.bankCreditDate),
      bankAccountId: input.bankAccountId ?? p.bankAccountId,
      transactionRef: input.transactionRef,
      paymentMode: input.paymentMode,
      paymentStatus: input.paymentStatus,
      status,
      paidAt: input.paymentStatus === "PAID" ? p.paidAt ?? new Date() : p.paidAt,
      notes: input.notes ?? p.notes,
    },
  });
  await audit(actor, {
    action: "payroll.bank_credit_recorded", entity: "Payroll", entityId: id,
    oldValue: { actualBankCredit: p.actualBankCredit, paymentStatus: p.paymentStatus, transactionRef: p.transactionRef },
    newValue: {
      employee: p.employee.employeeCode, month: p.month, netSalary: p.netSalary,
      actualBankCredit: input.actualBankCredit, bankCreditDate: input.bankCreditDate, transactionRef: input.transactionRef, paymentStatus: input.paymentStatus,
      variance: round2(input.actualBankCredit - dec(p.netSalary)),
    },
  });
  return updated;
}

/** Monthly payroll history for one employee (for the profile's Payroll tab). */
export async function employeePayrollHistory(employeeId: string, actor: Actor) {
  const where: Prisma.PayrollWhereInput = { employeeId, deletedAt: null, ...scope(actor) };
  const rows = await prisma.payroll.findMany({
    where,
    orderBy: { month: "desc" },
    include: { payslip: { select: { id: true, payslipNumber: true } }, items: true, deductions: true },
  });
  return rows.map((p) => ({ ...p, bankCreditDate: dateOnly(p.bankCreditDate), netFormatted: formatMoney(dec(p.netSalary)) }));
}
