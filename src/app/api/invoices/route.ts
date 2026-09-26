import { api, created } from "@/lib/api/handler";
import { parseList } from "@/lib/api/list-query";
import { invoiceSchema } from "@/validations/finance";
import { createInvoice, listInvoices } from "@/services/invoice.service";

export const GET = api({ permission: "billing.read" }, async ({ query }) => listInvoices(parseList(query)));

export const POST = api({ permission: "billing.write" }, async ({ body, actor }) => created(await createInvoice(await body(invoiceSchema), actor)));
