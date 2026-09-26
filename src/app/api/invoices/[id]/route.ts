import { api } from "@/lib/api/handler";
import { invoiceSchema } from "@/validations/finance";
import { archiveInvoice, getInvoice, updateInvoice } from "@/services/invoice.service";

type P = { id: string };

export const GET = api<P>({ permission: "billing.read" }, async ({ params }) => getInvoice(params.id));

export const PUT = api<P>({ permission: "billing.write" }, async ({ params, body, actor }) => updateInvoice(params.id, await body(invoiceSchema), actor));

export const DELETE = api<P>({ permission: "billing.write" }, async ({ params, actor }) => {
  await archiveInvoice(params.id, actor);
});
