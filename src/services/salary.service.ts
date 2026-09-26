import "server-only";
import type { z } from "zod";
import { prisma, type Tx } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import type { Actor } from "@/lib/api/handler";
import { badRequest, notFound } from "@/lib/api/errors";
import { addDays, dateOnly, monthBounds, parseDateOnly, type Month } from "@/lib/dates";
import { round2 } from "@/lib/money";
import { dec } from "@/lib/serialize";
import type { salaryStructureSchema, recurringDeductionSchema, deductionRuleSchema } from "@/validations/salary";
import { assertEmployeeAccess } from "./employee.service";

type StructureData = z.output<typeof salaryStructureSchema>;
type RecurringData = z.output<typeof recurringDeductionSchema>;
type RuleData = z.output<typeof deductionRuleSchema>;

/** The structure in force for a payroll month: the latest version that started on or before month end. */
export async function structureForMonth(employeeId: string, month: Month, tx: Tx | typeof prisma = prisma) {
  const { start, end } = monthBounds(month);
  return tx.salaryStructure.findFirst({
    where: { employeeId, effectiveFrom: { lte: end }, OR: [{ effectiveTo: null }, { effectiveTo: { gte: start } }] },
    orderBy: { effectiveFrom: "desc" },
  });
}

export async function salaryHistory(employeeId: string, actor: Actor) {
  assertEmployeeAccess(actor, employeeId);
  const [structures, revisions, recurring] = await Promise.all([
    prisma.salaryStructure.findMany({ where: { employeeId }, orderBy: { effectiveFrom: "desc" } }),
    prisma.salaryRevision.findMany({
      where: { employeeId },
      orderBy: { effectiveFrom: "desc" },
      include: { revisedBy: { select: { name: true } } },
    }),
    prisma.recurringDeduction.findMany({ where: { employeeId }, orderBy: [{ isActive: "desc" }, { startMonth: "desc" }] }),
  ]);
  return {
    current: structures.find((s) => !s.effectiveTo) ?? null,
    structures: structures.map((s) => ({ ...s, effectiveFrom: dateOnly(s.effectiveFrom), effectiveTo: dateOnly(s.effectiveTo) })),
    revisions: revisions.map((r) => ({ ...r, effectiveFrom: dateOnly(r.effectiveFrom) })),
    recurring,
  };
}

/**
 * Adds a new salary version. Nothing is overwritten: the current version gets an
 * end date the day before, and a SalaryRevision row records the change.
 */
export async function reviseSalary(employeeId: string, input: StructureData, actor: Actor) {
  const employee = await prisma.employee.findFirst({ where: { id: employeeId, deletedAt: null } });
  if (!employee) throw notFound("Employee");

  const effectiveFrom = parseDateOnly(input.effectiveFrom);
  const components = round2(input.basic + input.hra + input.specialAllowance + input.otherAllowances + input.bonus + input.employerPf + input.gratuity);
  const monthlyCtc = round2(input.annualCtc / 12);
  if (Math.abs(components - monthlyCtc) > 1) {
    throw badRequest(
      `The monthly components add up to ${components.toLocaleString("en-IN")} but the CTC works out to ${monthlyCtc.toLocaleString("en-IN")} a month.`,
      { fields: { basic: "Components must add up to CTC ÷ 12" } },
    );
  }

  const result = await prisma.$transaction(async (tx) => {
    const latest = await tx.salaryStructure.findFirst({ where: { employeeId }, orderBy: { effectiveFrom: "desc" } });
    if (latest && effectiveFrom <= latest.effectiveFrom) {
      throw badRequest(`A revision must start after the current one (${dateOnly(latest.effectiveFrom)}). Earlier versions are kept as history and cannot be replaced.`);
    }
    const locked = await tx.payroll.findFirst({
      where: { employeeId, deletedAt: null, status: { in: ["APPROVED", "PROCESSING", "PAID"] }, month: { gte: input.effectiveFrom.slice(0, 7) } },
      select: { month: true },
    });
    if (locked) throw badRequest(`Payroll for ${locked.month} is already approved. Start the revision after that month.`);

    if (latest && (!latest.effectiveTo || latest.effectiveTo >= effectiveFrom)) {
      await tx.salaryStructure.update({ where: { id: latest.id }, data: { effectiveTo: addDays(effectiveFrom, -1) } });
    }
    const structure = await tx.salaryStructure.create({
      data: {
        employeeId,
        annualCtc: input.annualCtc,
        monthlyCtc,
        basic: input.basic,
        hra: input.hra,
        specialAllowance: input.specialAllowance,
        otherAllowances: input.otherAllowances,
        bonus: input.bonus,
        employerPf: input.employerPf,
        gratuity: input.gratuity,
        effectiveFrom,
        notes: input.notes,
        createdById: actor.userId,
      },
    });
    const prevCtc = latest ? dec(latest.annualCtc) : null;
    const revision = await tx.salaryRevision.create({
      data: {
        employeeId,
        fromStructureId: latest?.id ?? null,
        toStructureId: structure.id,
        previousCtc: prevCtc,
        newCtc: input.annualCtc,
        changePercent: prevCtc ? round2(((input.annualCtc - prevCtc) / prevCtc) * 100) : null,
        reason: input.reason ?? (latest ? "Salary revision" : "Initial salary"),
        effectiveFrom,
        revisedById: actor.userId,
      },
    });
    await audit(actor, {
      action: latest ? "salary.revised" : "salary.created",
      entity: "SalaryStructure",
      entityId: structure.id,
      oldValue: latest ? { annualCtc: latest.annualCtc, effectiveFrom: dateOnly(latest.effectiveFrom) } : undefined,
      newValue: { employee: employee.employeeCode, annualCtc: input.annualCtc, effectiveFrom: input.effectiveFrom, reason: revision.reason },
    }, tx);
    return structure;
  });
  return result;
}

// ── recurring deductions ──

export async function addRecurring(employeeId: string, input: RecurringData, actor: Actor) {
  const r = await prisma.recurringDeduction.create({ data: { ...input, employeeId } });
  await audit(actor, { action: "deduction.recurring_added", entity: "RecurringDeduction", entityId: r.id, newValue: r });
  return r;
}

export async function updateRecurring(employeeId: string, id: string, input: RecurringData, actor: Actor) {
  const before = await prisma.recurringDeduction.findFirst({ where: { id, employeeId } });
  if (!before) throw notFound("Deduction");
  const r = await prisma.recurringDeduction.update({ where: { id }, data: input });
  await audit(actor, { action: "deduction.recurring_updated", entity: "RecurringDeduction", entityId: id, oldValue: before, newValue: r });
  return r;
}

// ── deduction rules ──

export const listRules = () => prisma.deductionRule.findMany({ orderBy: [{ sortOrder: "asc" }, { code: "asc" }] });

export async function saveRule(id: string | null, input: RuleData, actor: Actor) {
  if (id) {
    const before = await prisma.deductionRule.findUnique({ where: { id } });
    if (!before) throw notFound("Rule");
    const r = await prisma.deductionRule.update({ where: { id }, data: input });
    await audit(actor, { action: "deduction.rule_updated", entity: "DeductionRule", entityId: id, oldValue: before, newValue: r });
    return r;
  }
  const r = await prisma.deductionRule.create({ data: input });
  await audit(actor, { action: "deduction.rule_created", entity: "DeductionRule", entityId: r.id, newValue: r });
  return r;
}
