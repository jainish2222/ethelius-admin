import { api, actorCan } from "@/lib/api/handler";
import { prisma } from "@/lib/prisma";
import { activityFor } from "@/services/audit.service";

type P = { id: string };

export const GET = api<P>({ permission: "company.read" }, async ({ params, actor }) => {
  const finance = actorCan(actor, "billing.read");
  const [projects, invoices, payments, contacts] = await Promise.all([
    prisma.project.findMany({ where: { companyId: params.id }, select: { id: true } }),
    finance ? prisma.invoice.findMany({ where: { companyId: params.id }, select: { id: true } }) : [],
    finance ? prisma.payment.findMany({ where: { companyId: params.id }, select: { id: true } }) : [],
    prisma.companyContact.findMany({ where: { companyId: params.id }, select: { id: true } }),
  ]);
  return activityFor({ entityIds: [params.id, ...[...projects, ...invoices, ...payments, ...contacts].map((x) => x.id)] }, 60);
});
