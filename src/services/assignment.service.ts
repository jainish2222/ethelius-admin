import "server-only";
import type { z } from "zod";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { audit, diff } from "@/lib/audit";
import { actorCan, type Actor } from "@/lib/api/handler";
import { badRequest, notFound } from "@/lib/api/errors";
import { csv, orderBy, paging, type ListQuery } from "@/lib/api/list-query";
import { addDays, dateOnly, parseDateOnly, todayDateOnly } from "@/lib/dates";
import type { assignmentSchema } from "@/validations/business";

type AssignmentData = z.output<typeof assignmentSchema>;

const toData = (i: AssignmentData) => ({
  ...i,
  startDate: parseDateOnly(i.startDate),
  endDate: i.endDate ? parseDateOnly(i.endDate) : null,
});

export async function listAssignments(q: ListQuery, actor: Actor) {
  const where: Prisma.ProjectAssignmentWhereInput = {
    employee: { deletedAt: null },
    project: { deletedAt: null },
  };
  if (q.q) where.OR = [
    { employee: { fullName: { contains: q.q, mode: "insensitive" } } },
    { project: { name: { contains: q.q, mode: "insensitive" } } },
    { role: { contains: q.q, mode: "insensitive" } },
  ];
  const statuses = csv(q.status);
  if (statuses.length) where.status = { in: statuses as never };
  if (q.employeeId) where.employeeId = String(q.employeeId);
  if (q.projectId) where.projectId = String(q.projectId);
  if (q.companyId) where.project = { deletedAt: null, companyId: String(q.companyId) };
  if (q.current === "true") {
    const today = parseDateOnly(todayDateOnly());
    where.status = "ACTIVE";
    where.startDate = { lte: today };
    where.AND = [{ OR: [{ endDate: null }, { endDate: { gte: today } }] }];
  }
  if (q.from) where.AND = [...((where.AND as object[]) ?? []), { OR: [{ endDate: null }, { endDate: { gte: parseDateOnly(String(q.from)) } }] }];
  if (q.to) where.startDate = { ...(where.startDate as object), lte: parseDateOnly(String(q.to)) };

  const seeCost = actorCan(actor, "salary.read") || actorCan(actor, "report.project");
  const [rows, total] = await Promise.all([
    prisma.projectAssignment.findMany({
      where,
      orderBy: orderBy(q, {
        employee: (d) => ({ employee: { fullName: d } }),
        project: (d) => ({ project: { name: d } }),
        startDate: (d) => ({ startDate: d }),
        endDate: (d) => ({ endDate: d }),
        allocation: (d) => ({ allocationPercent: d }),
        status: (d) => ({ status: d }),
      }, [{ status: "asc" }, { startDate: "desc" }] as Prisma.ProjectAssignmentOrderByWithRelationInput[]),
      ...paging(q),
      include: {
        employee: { select: { id: true, fullName: true, employeeCode: true, designation: true } },
        project: { select: { id: true, name: true, code: true, company: { select: { id: true, name: true } } } },
      },
    }),
    prisma.projectAssignment.count({ where }),
  ]);
  return {
    total, page: q.page, pageSize: q.pageSize,
    data: rows.map((a) => ({
      ...a,
      startDate: dateOnly(a.startDate),
      endDate: dateOnly(a.endDate),
      billingRate: seeCost ? a.billingRate : null,
      employeeCost: seeCost ? a.employeeCost : null,
    })),
  };
}

/** An employee's overlapping active/planned allocations may not exceed 100%. */
async function assertAllocation(input: AssignmentData, excludeId?: string) {
  if (input.status === "ENDED") return;
  const start = parseDateOnly(input.startDate);
  const end = input.endDate ? parseDateOnly(input.endDate) : null;
  const overlapping = await prisma.projectAssignment.findMany({
    where: {
      employeeId: input.employeeId,
      status: { in: ["ACTIVE", "PLANNED"] },
      id: excludeId ? { not: excludeId } : undefined,
      ...(end ? { startDate: { lte: end } } : {}),
      OR: [{ endDate: null }, { endDate: { gte: start } }],
    },
    include: { project: { select: { name: true } } },
  });
  const total = overlapping.reduce((s, a) => s + a.allocationPercent, 0) + input.allocationPercent;
  if (total > 100) {
    throw badRequest(
      `This would allocate the employee ${total}% over these dates (already on ${overlapping.map((a) => `${a.project.name} ${a.allocationPercent}%`).join(", ")}). Reduce the allocation or end another assignment first.`,
      { fields: { allocationPercent: "Over 100% in total" } },
    );
  }
}

async function assertRefs(input: AssignmentData) {
  const [e, p] = await Promise.all([
    prisma.employee.findFirst({ where: { id: input.employeeId, deletedAt: null } }),
    prisma.project.findFirst({ where: { id: input.projectId, deletedAt: null } }),
  ]);
  if (!e) throw notFound("Employee");
  if (!p) throw notFound("Project");
  return { e, p };
}

export async function createAssignment(input: AssignmentData, actor: Actor) {
  const { e, p } = await assertRefs(input);
  await assertAllocation(input);
  const a = await prisma.projectAssignment.create({ data: toData(input) });
  await audit(actor, { action: "assignment.created", entity: "ProjectAssignment", entityId: a.id, newValue: { ...a, employee: e.fullName, project: p.name } });
  return a;
}

export async function updateAssignment(id: string, input: AssignmentData, actor: Actor) {
  const before = await prisma.projectAssignment.findUnique({ where: { id } });
  if (!before) throw notFound("Assignment");
  if (before.employeeId !== input.employeeId || before.projectId !== input.projectId) {
    throw badRequest("To move someone to a different project, end this assignment and create a new one — that keeps their history.");
  }
  await assertAllocation(input, id);
  const after = await prisma.projectAssignment.update({ where: { id }, data: toData(input) });
  const d = diff(before, after);
  if (d.changed) await audit(actor, { action: "assignment.updated", entity: "ProjectAssignment", entityId: id, oldValue: d.oldValue, newValue: d.newValue });
  return after;
}

/** Ends an assignment as of a date (default yesterday), keeping it as history. */
export async function endAssignment(id: string, endDate: string | null, actor: Actor) {
  const a = await prisma.projectAssignment.findUnique({ where: { id } });
  if (!a) throw notFound("Assignment");
  const end = endDate ? parseDateOnly(endDate) : addDays(parseDateOnly(todayDateOnly()), -1);
  if (end < a.startDate) throw badRequest("The end date is before the assignment started.");
  const after = await prisma.projectAssignment.update({ where: { id }, data: { endDate: end, status: "ENDED" } });
  await audit(actor, { action: "assignment.ended", entity: "ProjectAssignment", entityId: id, oldValue: { status: a.status, endDate: dateOnly(a.endDate) }, newValue: { status: "ENDED", endDate: dateOnly(end) } });
  return after;
}
