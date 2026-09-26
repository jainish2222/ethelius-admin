import { api, created } from "@/lib/api/handler";
import { parseList } from "@/lib/api/list-query";
import { payrollGenerateSchema } from "@/validations/finance";
import { generatePayroll, listPayroll } from "@/services/payroll.service";

export const GET = api({ permission: ["payroll.read", "self.view"], mode: "any" }, async ({ query, actor }) => listPayroll(parseList(query), actor));

/** Generates draft payroll for a month (and calculates it by default). */
export const POST = api({ permission: "payroll.write" }, async ({ body, actor }) => {
  const { month, employeeIds, calculate } = await body(payrollGenerateSchema);
  return created(await generatePayroll(month, employeeIds, calculate, actor));
});
