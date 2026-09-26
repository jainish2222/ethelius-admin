import { api, created } from "@/lib/api/handler";
import { parseList } from "@/lib/api/list-query";
import { paymentSchema } from "@/validations/finance";
import { createPayment, listPayments } from "@/services/payment.service";

export const GET = api({ permission: "payment.read" }, async ({ query }) => listPayments(parseList(query)));

export const POST = api({ permission: "payment.write" }, async ({ body, actor }) => created(await createPayment(await body(paymentSchema), actor)));
