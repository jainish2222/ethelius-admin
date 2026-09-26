import "server-only";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { audit, diff } from "@/lib/audit";
import { notify } from "@/lib/notify";
import { actorCan, type Actor } from "@/lib/api/handler";
import { forbidden, notFound } from "@/lib/api/errors";
import { csv, orderBy, paging, type ListQuery } from "@/lib/api/list-query";
import { parseDateOnly, dateOnly, todayDateOnly } from "@/lib/dates";
import { maskAccount } from "@/lib/money";
import { dec } from "@/lib/serialize";
import { saveUpload } from "@/lib/storage";
import type { EmployeeInput, BankAccountInput } from "@/validations/employee";
import type { employeeSchema, bankAccountSchema } from "@/validations/employee";
import type { z } from "zod";

type EmployeeData = z.output<typeof employeeSchema>;
type BankData = z.output<typeof bankAccountSchema>;

const PII_FIELDS = ["pan", "uan", "pfNumber", "esiNumber", "dateOfBirth", "address", "personalEmail", "emergencyContactName", "emergencyContactPhone", "emergencyRelation"] as const;

/** Throws unless the actor may see this employee (HR/finance/PM, or the employee themself). */
export function assertEmployeeAccess(actor: Actor, employeeId: string) {
  if (actorCan(actor, "employee.read")) return;
  if (actorCan(actor, "self.view") && actor.employeeId === employeeId) return;
  throw forbidden();
}

const isSelf = (actor: Actor, id: string) => actor.employeeId === id;

/** Strips fields the actor is not cleared to see. Their own record is always visible to them. */
function redact<T extends Record<string, unknown>>(e: T, actor: Actor): T {
  const out: Record<string, unknown> = { ...e };
  const self = isSelf(actor, String(e.id));
  if (!actorCan(actor, "employee.pii") && !self) for (const f of PII_FIELDS) if (f in out) out[f] = null;
  return out as T;
}

function toData(input: EmployeeData) {
  return {
    ...input,
    pan: input.pan?.toUpperCase() ?? null,
    dateOfBirth: input.dateOfBirth ? parseDateOnly(input.dateOfBirth) : null,
    joiningDate: parseDateOnly(input.joiningDate),
    exitDate: input.exitDate ? parseDateOnly(input.exitDate) : null,
    experienceYears: input.experienceYears ?? null,
  };
}

const activeAssignmentWhere = (): Prisma.ProjectAssignmentWhereInput => {
  const today = parseDateOnly(todayDateOnly());
  return { status: "ACTIVE", startDate: { lte: today }, OR: [{ endDate: null }, { endDate: { gte: today } }] };
};

export async function listEmployees(q: ListQuery, actor: Actor) {
  const where: Prisma.EmployeeWhereInput = { deletedAt: null };
  if (!actorCan(actor, "employee.read")) where.id = actor.employeeId ?? "__none__";
  if (q.q) {
    where.OR = [
      { fullName: { contains: q.q, mode: "insensitive" } },
      { employeeCode: { contains: q.q, mode: "insensitive" } },
      { officialEmail: { contains: q.q, mode: "insensitive" } },
      { designation: { contains: q.q, mode: "insensitive" } },
    ];
  }
  const statuses = csv(q.status);
  if (statuses.length) where.status = { in: statuses as never };
  const types = csv(q.employmentType);
  if (types.length) where.employmentType = { in: types as never };
  if (q.department) where.department = String(q.department);
  if (q.projectId) where.assignments = { some: { ...activeAssignmentWhere(), projectId: String(q.projectId) } };
  if (q.companyId) where.assignments = { some: { ...activeAssignmentWhere(), project: { companyId: String(q.companyId) } } };
  if (q.from || q.to) {
    where.joiningDate = {
      ...(q.from ? { gte: parseDateOnly(String(q.from)) } : {}),
      ...(q.to ? { lte: parseDateOnly(String(q.to)) } : {}),
    };
  }

  const showSalary = actorCan(actor, "salary.read");
  const [rows, total] = await Promise.all([
    prisma.employee.findMany({
      where,
      orderBy: orderBy(q, {
        name: (d) => ({ fullName: d }),
        code: (d) => ({ employeeCode: d }),
        designation: (d) => ({ designation: d }),
        department: (d) => ({ department: d }),
        joiningDate: (d) => ({ joiningDate: d }),
        status: (d) => ({ status: d }),
      }, { employeeCode: "asc" } as Prisma.EmployeeOrderByWithRelationInput),
      ...paging(q),
      include: {
        assignments: {
          where: activeAssignmentWhere(),
          include: { project: { select: { id: true, name: true, code: true, company: { select: { id: true, name: true } } } } },
          orderBy: { allocationPercent: "desc" },
        },
        salaryStructures: showSalary ? { where: { effectiveTo: null }, orderBy: { effectiveFrom: "desc" }, take: 1 } : false,
      },
    }),
    prisma.employee.count({ where }),
  ]);

  return {
    total, page: q.page, pageSize: q.pageSize,
    data: rows.map((e) => ({
      id: e.id,
      employeeCode: e.employeeCode,
      fullName: e.fullName,
      hasPhoto: !!e.photoPath,
      designation: e.designation,
      department: e.department,
      employmentType: e.employmentType,
      status: e.status,
      joiningDate: dateOnly(e.joiningDate),
      exitDate: dateOnly(e.exitDate),
      officialEmail: e.officialEmail,
      phone: e.phone,
      projects: e.assignments.map((a) => ({
        id: a.project.id, name: a.project.name, code: a.project.code,
        companyId: a.project.company.id, companyName: a.project.company.name, allocation: a.allocationPercent,
      })),
      currentCtc: showSalary ? dec((e as { salaryStructures?: { annualCtc: unknown }[] }).salaryStructures?.[0]?.annualCtc) || null : null,
    })),
  };
}

export async function getEmployee(id: string, actor: Actor) {
  assertEmployeeAccess(actor, id);
  const self = isSelf(actor, id);
  const showSalary = actorCan(actor, "salary.read") || self;
  const showBank = actorCan(actor, "employee.bank") || self;

  const e = await prisma.employee.findFirst({
    where: { id, deletedAt: null },
    include: {
      reportingManager: { select: { id: true, fullName: true, designation: true } },
      directReports: { where: { deletedAt: null }, select: { id: true, fullName: true, designation: true } },
      user: { select: { id: true, email: true, isActive: true, role: { select: { key: true, name: true } } } },
      assignments: {
        include: { project: { select: { id: true, name: true, code: true, status: true, company: { select: { id: true, name: true } } } } },
        orderBy: { startDate: "desc" },
      },
      bankAccounts: showBank ? { where: { deletedAt: null }, orderBy: { isPrimary: "desc" } } : false,
      salaryStructures: showSalary ? { orderBy: { effectiveFrom: "desc" }, take: 1, where: { effectiveTo: null } } : false,
    },
  });
  if (!e) throw notFound("Employee");

  const today = todayDateOnly();
  const { photoPath, ...rest } = e;
  const bank = (e as unknown as { bankAccounts?: { accountNumber: string }[] }).bankAccounts;
  return redact({
    ...rest,
    hasPhoto: !!photoPath,
    joiningDate: dateOnly(e.joiningDate),
    exitDate: dateOnly(e.exitDate),
    dateOfBirth: dateOnly(e.dateOfBirth),
    assignments: e.assignments.map((a) => ({
      ...a,
      startDate: dateOnly(a.startDate),
      endDate: dateOnly(a.endDate),
      isCurrent: a.status === "ACTIVE" && dateOnly(a.startDate) <= today && (!a.endDate || dateOnly(a.endDate) >= today),
    })),
    bankAccounts: bank?.map((b) => ({
      ...b,
      // Full numbers only for finance; the employee sees their own masked.
      accountNumber: actorCan(actor, "employee.bank") ? b.accountNumber : maskAccount(b.accountNumber),
    })) ?? null,
    currentSalary: (e as unknown as { salaryStructures?: unknown[] }).salaryStructures?.[0] ?? null,
    salaryStructures: undefined,
    access: {
      pii: actorCan(actor, "employee.pii") || self,
      bank: actorCan(actor, "employee.bank"),
      salary: actorCan(actor, "salary.read"),
      salaryWrite: actorCan(actor, "salary.write"),
      write: actorCan(actor, "employee.write"),
      self,
    },
  }, actor);
}

async function assertManagerValid(id: string | null, selfId?: string) {
  if (!id) return;
  if (id === selfId) throw forbidden("An employee cannot report to themself.");
  const m = await prisma.employee.findFirst({ where: { id, deletedAt: null } });
  if (!m) throw notFound("Reporting manager");
}

export async function createEmployee(input: EmployeeData, actor: Actor) {
  await assertManagerValid(input.reportingManagerId);
  const e = await prisma.employee.create({ data: toData(input) });
  await audit(actor, { action: "employee.created", entity: "Employee", entityId: e.id, newValue: e });
  await notify({
    type: "EMPLOYEE_JOINING",
    title: `${e.fullName} added as ${e.designation}`,
    body: `Joins on ${dateOnly(e.joiningDate)}`,
    link: `/employees/${e.id}`,
    permission: "employee.write",
    excludeUserId: actor.userId,
  });
  return e;
}

export async function updateEmployee(id: string, input: EmployeeData, actor: Actor) {
  const before = await prisma.employee.findFirst({ where: { id, deletedAt: null } });
  if (!before) throw notFound("Employee");
  await assertManagerValid(input.reportingManagerId, id);
  const data = toData(input);
  // HR without PII clearance submits the form with redacted values — keep what is stored.
  if (!actorCan(actor, "employee.pii")) for (const f of PII_FIELDS) delete (data as Record<string, unknown>)[f];

  const after = await prisma.employee.update({ where: { id }, data });
  const d = diff(before, after);
  if (d.changed) await audit(actor, { action: "employee.updated", entity: "Employee", entityId: id, oldValue: d.oldValue, newValue: d.newValue });

  if (before.status !== after.status && ["ON_NOTICE", "RESIGNED", "RELIEVED"].includes(after.status)) {
    await notify({
      type: "EMPLOYEE_LEAVING",
      title: `${after.fullName} is ${after.status === "ON_NOTICE" ? "on notice" : after.status.toLowerCase()}`,
      body: after.exitDate ? `Last day ${dateOnly(after.exitDate)}` : undefined,
      link: `/employees/${id}`,
      permission: "employee.write",
      excludeUserId: actor.userId,
    });
  }
  return after;
}

export async function archiveEmployee(id: string, actor: Actor) {
  const e = await prisma.employee.findFirst({ where: { id, deletedAt: null } });
  if (!e) throw notFound("Employee");
  await prisma.employee.update({ where: { id }, data: { deletedAt: new Date(), status: e.status === "ACTIVE" ? "INACTIVE" : e.status } });
  await audit(actor, { action: "employee.archived", entity: "Employee", entityId: id, oldValue: { status: e.status } });
}

export async function setEmployeePhoto(id: string, file: File, actor: Actor) {
  const e = await prisma.employee.findFirst({ where: { id, deletedAt: null } });
  if (!e) throw notFound("Employee");
  const rel = await saveUpload(file, ["employee", id, "photo"], { images: true });
  await prisma.employee.update({ where: { id }, data: { photoPath: rel } });
  await audit(actor, { action: "employee.photo_updated", entity: "Employee", entityId: id });
}

export async function getEmployeePhotoPath(id: string, actor: Actor) {
  // Photos are not sensitive: anyone who can see the directory, or the person themself.
  if (!actorCan(actor, ["employee.read", "assignment.read", "project.read"], "any")) assertEmployeeAccess(actor, id);
  const e = await prisma.employee.findUnique({ where: { id }, select: { photoPath: true } });
  if (!e?.photoPath) throw notFound("Photo");
  return e.photoPath;
}

/** Lightweight list for pickers. */
export async function employeeOptions(actor: Actor, opts: { includeInactive?: boolean } = {}) {
  if (!actorCan(actor, ["employee.read", "assignment.read", "payroll.read", "attendance.read", "expense.read", "user.manage"], "any")) throw forbidden();
  return prisma.employee.findMany({
    where: { deletedAt: null, ...(opts.includeInactive ? {} : { status: { in: ["ACTIVE", "ON_NOTICE"] } }) },
    select: { id: true, fullName: true, employeeCode: true, designation: true, department: true },
    orderBy: { fullName: "asc" },
  });
}

export async function departments() {
  const rows = await prisma.employee.findMany({ where: { deletedAt: null }, distinct: ["department"], select: { department: true }, orderBy: { department: "asc" } });
  return rows.map((r) => r.department);
}

// ── bank accounts ──

export async function addBankAccount(employeeId: string, input: BankData, actor: Actor) {
  const e = await prisma.employee.findFirst({ where: { id: employeeId, deletedAt: null } });
  if (!e) throw notFound("Employee");
  const acc = await prisma.$transaction(async (tx) => {
    await tx.employeeBankAccount.updateMany({ where: { employeeId, deletedAt: null }, data: { isPrimary: false } });
    return tx.employeeBankAccount.create({ data: { ...input, ifsc: input.ifsc.toUpperCase(), employeeId, isPrimary: true } });
  });
  await audit(actor, { action: "employee.bank_added", entity: "EmployeeBankAccount", entityId: acc.id, newValue: { ...acc, accountNumber: maskAccount(acc.accountNumber) } });
  return acc;
}

export async function archiveBankAccount(employeeId: string, accountId: string, actor: Actor) {
  const acc = await prisma.employeeBankAccount.findFirst({ where: { id: accountId, employeeId, deletedAt: null } });
  if (!acc) throw notFound("Bank account");
  await prisma.employeeBankAccount.update({ where: { id: accountId }, data: { deletedAt: new Date(), isPrimary: false } });
  await audit(actor, { action: "employee.bank_archived", entity: "EmployeeBankAccount", entityId: accountId, oldValue: { bankName: acc.bankName, accountNumber: maskAccount(acc.accountNumber) } });
}

export type { EmployeeInput, BankAccountInput, BankData };
