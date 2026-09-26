import { api } from "@/lib/api/handler";
import { payrollEditSchema } from "@/validations/finance";
import { editPayrollLines, getPayroll } from "@/services/payroll.service";

type P = { id: string };

export const GET = api<P>({ permission: ["payroll.read", "self.view"], mode: "any" }, async ({ params, actor }) => getPayroll(params.id, actor));

/** Replaces earnings and deduction lines (draft/calculated payroll only). */
export const PUT = api<P>({ permission: "payroll.write" }, async ({ params, body, actor }) => {
  await editPayrollLines(params.id, await body(payrollEditSchema), actor);
  return getPayroll(params.id, actor);
});
