import { api } from "@/lib/api/handler";
import { reconcilePayment } from "@/services/payment.service";

type P = { id: string };

export const POST = api<P>({ permission: "payment.write" }, async ({ params, actor }) => {
  await reconcilePayment(params.id, actor);
  return { ok: true };
});
