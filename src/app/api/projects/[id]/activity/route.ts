import { api, actorCan } from "@/lib/api/handler";
import { prisma } from "@/lib/prisma";
import { activityFor } from "@/services/audit.service";

type P = { id: string };

export const GET = api<P>({ permission: "project.read" }, async ({ params, actor }) => {
  const finance = actorCan(actor, "billing.read");
  const [assignments, invoices, payments, expenses] = await Promise.all([
    prisma.projectAssignment.findMany({ where: { projectId: params.id }, select: { id: true } }),
    finance ? prisma.invoice.findMany({ where: { projectId: params.id }, select: { id: true } }) : [],
    finance ? prisma.payment.findMany({ where: { projectId: params.id }, select: { id: true } }) : [],
    prisma.expense.findMany({ where: { projectId: params.id }, select: { id: true } }),
  ]);
  return activityFor({ entityIds: [params.id, ...[...assignments, ...invoices, ...payments, ...expenses].map((x) => x.id)] }, 60);
});
