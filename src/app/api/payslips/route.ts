import { api } from "@/lib/api/handler";
import { parseList } from "@/lib/api/list-query";
import { payslipGenerateSchema } from "@/validations/finance";
import { generatePayslips, listPayslips } from "@/services/payslip.service";

export const GET = api({ permission: ["payslip.read", "self.view"], mode: "any" }, async ({ query, actor }) => listPayslips(parseList(query), actor));

export const POST = api({ permission: "payslip.write" }, async ({ body, actor }) => {
  const { payrollIds, regenerate } = await body(payslipGenerateSchema);
  return { results: await generatePayslips(payrollIds, regenerate, actor) };
});
