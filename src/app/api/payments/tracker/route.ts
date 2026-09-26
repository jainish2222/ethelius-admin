import { api } from "@/lib/api/handler";
import { parseList } from "@/lib/api/list-query";
import { paymentTracker } from "@/services/payment.service";

export const GET = api({ permission: "payment.read" }, async ({ query }) => paymentTracker(parseList(query)));
