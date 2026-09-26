import { api } from "@/lib/api/handler";
import { parseList } from "@/lib/api/list-query";
import { listPayments } from "@/services/payment.service";

export const GET = api({ permission: "report.read" }, async ({ query }) => listPayments(parseList(query)));
