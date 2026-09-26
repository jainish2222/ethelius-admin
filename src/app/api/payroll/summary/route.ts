import { api } from "@/lib/api/handler";
import { badRequest } from "@/lib/api/errors";
import { currentMonth, isMonth } from "@/lib/dates";
import { payrollMonthSummary } from "@/services/payroll.service";

export const GET = api({ permission: "payroll.read" }, async ({ query }) => {
  const month = query.month ?? currentMonth();
  if (!isMonth(month)) throw badRequest("Choose a valid month.");
  return payrollMonthSummary(month);
});
