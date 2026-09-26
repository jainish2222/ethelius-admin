import { api } from "@/lib/api/handler";
import { paymentSchema } from "@/validations/finance";
import { archivePayment, getPayment, updatePayment } from "@/services/payment.service";

type P = { id: string };

export const GET = api<P>({ permission: "payment.read" }, async ({ params }) => getPayment(params.id));

export const PUT = api<P>({ permission: "payment.write" }, async ({ params, body, actor }) => updatePayment(params.id, await body(paymentSchema), actor));

export const DELETE = api<P>({ permission: "payment.write" }, async ({ params, actor }) => {
  await archivePayment(params.id, actor);
});
