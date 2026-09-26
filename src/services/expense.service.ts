import "server-only";
import type { z } from "zod";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { audit, diff } from "@/lib/audit";
import { notify } from "@/lib/notify";
import { actorCan, requirePermission, type Actor } from "@/lib/api/handler";
import { badRequest, conflict, forbidden, notFound } from "@/lib/api/errors";
import { csv, orderBy, paging, type ListQuery } from "@/lib/api/list-query";
import { dateOnly, parseDateOnly, todayDateOnly } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { dec } from "@/lib/serialize";
import { saveUpload } from "@/lib/storage";
import type { expenseSchema, expenseDecisionSchema } from "@/validations/business";

type ExpenseData = z.output<typeof expenseSchema>;
type Decision = z.output<typeof expenseDecisionSchema>;

function scope(actor: Actor): Prisma.ExpenseWhereInput {
  if (actorCan(actor, "expense.read")) return {};
  if (actorCan(actor, "self.view") && actor.employeeId) return { employeeId: actor.employeeId };
  throw forbidden();
}

export async function listExpenses(q: ListQuery, actor: Actor) {
  const where: Prisma.ExpenseWhereInput = { deletedAt: null, ...scope(actor) };
  if (q.q) where.OR = [
    { description: { contains: q.q, mode: "insensitive" } },
    { employee: { fullName: { contains: q.q, mode: "insensitive" } } },
    { project: { name: { contains: q.q, mode: "insensitive" } } },
  ];
  const statuses = csv(q.status);
  if (statuses.length) where.status = { in: statuses as never };
  if (q.type) where.type = q.type as never;
  if (q.employeeId) where.employeeId = String(q.employeeId);
  if (q.projectId) where.projectId = String(q.projectId);
  if (q.companyId) where.project = { companyId: String(q.companyId) };
  if (q.from || q.to) where.date = {
    ...(q.from ? { gte: parseDateOnly(String(q.from)) } : {}),
    ...(q.to ? { lte: parseDateOnly(String(q.to)) } : {}),
  };

  const [rows, total, sums] = await Promise.all([
    prisma.expense.findMany({
      where,
      orderBy: orderBy(q, {
        date: (d) => ({ date: d }),
        amount: (d) => ({ amount: d }),
        employee: (d) => ({ employee: { fullName: d } }),
        project: (d) => ({ project: { name: d } }),
        status: (d) => ({ status: d }),
      }, [{ date: "desc" }, { createdAt: "desc" }] as Prisma.ExpenseOrderByWithRelationInput[]),
      ...paging(q),
      include: {
        employee: { select: { id: true, fullName: true, employeeCode: true } },
        project: { select: { id: true, name: true, code: true, company: { select: { id: true, name: true } } } },
        approvedBy: { select: { name: true } },
      },
    }),
    prisma.expense.count({ where }),
    prisma.expense.groupBy({ by: ["status"], where, _sum: { amount: true }, _count: true }),
  ]);
  return {
    total, page: q.page, pageSize: q.pageSize,
    data: rows.map(({ receiptPath, ...e }) => ({ ...e, hasReceipt: !!receiptPath, date: dateOnly(e.date), paidDate: dateOnly(e.paidDate) })),
    summary: Object.fromEntries(sums.map((s) => [s.status, { amount: dec(s._sum.amount), count: s._count }])),
  };
}

async function assertRefs(input: ExpenseData, actor: Actor) {
  if (!actorCan(actor, "expense.read") && input.employeeId !== actor.employeeId) throw forbidden("You can only submit your own expenses.");
  if (input.projectId) {
    const p = await prisma.project.findFirst({ where: { id: input.projectId, deletedAt: null } });
    if (!p) throw notFound("Project");
  }
  if (input.employeeId) {
    const e = await prisma.employee.findFirst({ where: { id: input.employeeId, deletedAt: null } });
    if (!e) throw notFound("Employee");
  }
  if (!input.projectId && !input.employeeId) throw badRequest("Link the expense to an employee, a project, or both.");
}

const toData = (i: ExpenseData) => ({ ...i, date: parseDateOnly(i.date) });

export async function createExpense(input: ExpenseData, actor: Actor) {
  if (!actorCan(actor, "expense.write") && actorCan(actor, "self.view")) input = { ...input, employeeId: actor.employeeId };
  await assertRefs(input, actor);
  const e = await prisma.expense.create({ data: { ...toData(input), submittedById: actor.userId } });
  await audit(actor, { action: "expense.submitted", entity: "Expense", entityId: e.id, newValue: e });
  await notify({
    type: "EXPENSE_SUBMITTED",
    title: `Expense submitted: ${formatMoney(input.amount, input.currency)}`,
    body: input.description,
    link: `/expenses?status=PENDING`,
    permission: "expense.approve",
    excludeUserId: actor.userId,
  });
  return e;
}

export async function updateExpense(id: string, input: ExpenseData, actor: Actor) {
  const before = await prisma.expense.findFirst({ where: { id, deletedAt: null, ...scope(actor) } });
  if (!before) throw notFound("Expense");
  if (before.status !== "PENDING") throw conflict("Only pending expenses can be edited.");
  await assertRefs(input, actor);
  const after = await prisma.expense.update({ where: { id }, data: toData(input) });
  const d = diff(before, after);
  if (d.changed) await audit(actor, { action: "expense.updated", entity: "Expense", entityId: id, oldValue: d.oldValue, newValue: d.newValue });
  return after;
}

export async function decideExpense(id: string, input: Decision, actor: Actor) {
  requirePermission(actor, "expense.approve");
  const e = await prisma.expense.findFirst({ where: { id, deletedAt: null } });
  if (!e) throw notFound("Expense");
  let data: Prisma.ExpenseUpdateInput;
  if (input.action === "approve") {
    if (e.status !== "PENDING") throw conflict("Only pending expenses can be approved.");
    data = { status: "APPROVED", approvedBy: { connect: { id: actor.userId } }, approvedAt: new Date(), rejectionReason: null };
  } else if (input.action === "reject") {
    if (e.status !== "PENDING") throw conflict("Only pending expenses can be rejected.");
    if (!input.reason) throw badRequest("Give a reason so the submitter knows what to fix.");
    data = { status: "REJECTED", approvedBy: { connect: { id: actor.userId } }, approvedAt: new Date(), rejectionReason: input.reason };
  } else {
    if (e.status !== "APPROVED") throw conflict("Approve the expense before marking it paid.");
    data = { status: "PAID", paidDate: parseDateOnly(input.paidDate ?? todayDateOnly()) };
  }
  const after = await prisma.expense.update({ where: { id }, data });
  await audit(actor, { action: `expense.${after.status.toLowerCase()}`, entity: "Expense", entityId: id, oldValue: { status: e.status }, newValue: { status: after.status, reason: input.reason } });
  return after;
}

export async function archiveExpense(id: string, actor: Actor) {
  const e = await prisma.expense.findFirst({ where: { id, deletedAt: null, ...scope(actor) } });
  if (!e) throw notFound("Expense");
  if (e.status === "PAID") throw conflict("Paid expenses are part of the books and cannot be archived.");
  await prisma.expense.update({ where: { id }, data: { deletedAt: new Date() } });
  await audit(actor, { action: "expense.archived", entity: "Expense", entityId: id, oldValue: { amount: e.amount, status: e.status } });
}

export async function attachReceipt(id: string, file: File, actor: Actor) {
  const e = await prisma.expense.findFirst({ where: { id, deletedAt: null, ...scope(actor) } });
  if (!e) throw notFound("Expense");
  const folder = e.employeeId ? ["employee", e.employeeId, "expenses"] : ["project", e.projectId!, "expenses"];
  const rel = await saveUpload(file, folder);
  await prisma.expense.update({ where: { id }, data: { receiptPath: rel } });
  await audit(actor, { action: "expense.receipt_attached", entity: "Expense", entityId: id });
}

export async function receiptPath(id: string, actor: Actor) {
  const e = await prisma.expense.findFirst({ where: { id, deletedAt: null, ...scope(actor) }, select: { receiptPath: true } });
  if (!e?.receiptPath) throw notFound("Receipt");
  return e.receiptPath;
}
