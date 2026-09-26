import { api } from "@/lib/api/handler";
import { badRequest } from "@/lib/api/errors";
import { addMonths, currentMonth, isMonth } from "@/lib/dates";
import { billingGrid } from "@/services/invoice.service";

export const GET = api({ permission: "billing.read" }, async ({ query }) => {
  const to = query.to ?? currentMonth();
  const from = query.from ?? addMonths(to, -5);
  if (!isMonth(from) || !isMonth(to) || from > to) throw badRequest("Choose a valid month range.");
  if (addMonths(from, 24) < to) throw badRequest("Show at most 24 months at a time.");
  return billingGrid(from, to, query.companyId);
});
