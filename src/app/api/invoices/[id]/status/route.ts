import { api } from "@/lib/api/handler";
import { invoiceStatusSchema } from "@/validations/finance";
import { changeInvoiceStatus } from "@/services/invoice.service";

type P = { id: string };

export const POST = api<P>({ permission: "billing.write" }, async ({ params, body, actor }) => {
  const { action } = await body(invoiceStatusSchema);
  return changeInvoiceStatus(params.id, action, actor);
});
