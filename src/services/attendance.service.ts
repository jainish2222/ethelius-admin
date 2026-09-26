import "server-only";
import type { z } from "zod";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import type { Actor } from "@/lib/api/handler";
import { badRequest, notFound } from "@/lib/api/errors";
import { dateOnly, daysInMonth, monthBounds, type Month } from "@/lib/dates";
import { dec } from "@/lib/serialize";
import type { attendanceSchema } from "@/validations/finance";

type AttendanceData = z.output<typeof attendanceSchema>;

/** Employees on the books at any point in the month. */
export async function employeesInMonth(month: Month, employeeIds?: string[]) {
  const { start, end } = monthBounds(month);
  return prisma.employee.findMany({
    where: {
      deletedAt: null,
      id: employeeIds?.length ? { in: employeeIds } : undefined,
      joiningDate: { lte: end },
      OR: [{ exitDate: null }, { exitDate: { gte: start } }],
      status: { in: ["ACTIVE", "ON_NOTICE", "RESIGNED", "RELIEVED"] },
    },
    orderBy: { fullName: "asc" },
  });
}

/**
 * Attendance used by payroll when none has been recorded: full month, trimmed for
 * people who joined or left part-way through.
 */
export function defaultAttendance(month: Month, joiningDate: Date, exitDate: Date | null) {
  const total = daysInMonth(month);
  const { start, end } = monthBounds(month);
  const from = joiningDate > start ? joiningDate : start;
  const to = exitDate && exitDate < end ? exitDate : end;
  const active = Math.max(0, Math.round((to.getTime() - from.getTime()) / 86400000) + 1);
  return { workingDays: total, presentDays: active, lopDays: total - active, paidDays: active, overtimeHours: 0, leaveBalance: null as number | null };
}

export async function attendanceForMonth(month: Month, q?: string) {
  const employees = await employeesInMonth(month);
  const rows = await prisma.attendance.findMany({ where: { month, employeeId: { in: employees.map((e) => e.id) } } });
  const byEmp = new Map(rows.map((r) => [r.employeeId, r]));
  const needle = q?.toLowerCase();
  return employees
    .filter((e) => !needle || e.fullName.toLowerCase().includes(needle) || e.employeeCode.toLowerCase().includes(needle))
    .map((e) => {
      const a = byEmp.get(e.id);
      const def = defaultAttendance(month, e.joiningDate, e.exitDate);
      return {
        employee: { id: e.id, fullName: e.fullName, employeeCode: e.employeeCode, department: e.department, joiningDate: dateOnly(e.joiningDate), exitDate: dateOnly(e.exitDate) },
        recorded: !!a,
        attendance: a
          ? {
              id: a.id, workingDays: dec(a.workingDays), presentDays: dec(a.presentDays), paidLeave: dec(a.paidLeave),
              unpaidLeave: dec(a.unpaidLeave), lopDays: dec(a.lopDays), holidays: dec(a.holidays),
              overtimeHours: dec(a.overtimeHours), leaveBalance: a.leaveBalance == null ? null : dec(a.leaveBalance),
              notes: a.notes, paidDays: dec(a.workingDays) - dec(a.lopDays),
            }
          : { id: null, ...def, paidLeave: 0, unpaidLeave: 0, holidays: 0, notes: null },
      };
    });
}

async function assertNotLocked(employeeId: string, month: Month) {
  const p = await prisma.payroll.findUnique({ where: { employeeId_month: { employeeId, month } } });
  if (p && ["APPROVED", "PROCESSING", "PAID"].includes(p.status)) {
    throw badRequest(`Payroll for ${month} is already approved, so its attendance is locked.`);
  }
}

export async function saveAttendance(input: AttendanceData, actor: Actor) {
  const e = await prisma.employee.findFirst({ where: { id: input.employeeId, deletedAt: null } });
  if (!e) throw notFound("Employee");
  await assertNotLocked(input.employeeId, input.month);
  const data = { ...input, leaveBalance: input.leaveBalance ?? null };
  const before = await prisma.attendance.findUnique({ where: { employeeId_month: { employeeId: input.employeeId, month: input.month } } });
  const row = await prisma.attendance.upsert({
    where: { employeeId_month: { employeeId: input.employeeId, month: input.month } },
    create: data,
    update: data,
  });
  await audit(actor, { action: before ? "attendance.updated" : "attendance.recorded", entity: "Attendance", entityId: row.id, oldValue: before ?? undefined, newValue: { ...data, employee: e.employeeCode } });
  return row;
}

/** Records the default full-month attendance for everyone who has none yet. */
export async function prefillAttendance(month: Month, actor: Actor) {
  const employees = await employeesInMonth(month);
  const existing = new Set((await prisma.attendance.findMany({ where: { month }, select: { employeeId: true } })).map((r) => r.employeeId));
  const toCreate = employees.filter((e) => !existing.has(e.id));
  if (toCreate.length) {
    await prisma.attendance.createMany({
      data: toCreate.map((e) => {
        const d = defaultAttendance(month, e.joiningDate, e.exitDate);
        return { employeeId: e.id, month, workingDays: d.workingDays, presentDays: d.presentDays, lopDays: d.lopDays };
      }),
      skipDuplicates: true,
    });
  }
  await audit(actor, { action: "attendance.prefilled", entity: "Attendance", newValue: { month, created: toCreate.length } });
  return { created: toCreate.length };
}
