import { api } from "@/lib/api/handler";
import { payrollActionSchema } from "@/validations/finance";
import { changePayrollStatus, getPayroll } from "@/services/payroll.service";

type P = { id: string };

/** calculate · approve (payroll.approve) · cancel · reopen */
export const POST = api<P>({ permission: "payroll.write" }, async ({ params, body, actor }) => {
  const { action } = await body(payrollActionSchema);
  await changePayrollStatus(params.id, action, actor);
  return getPayroll(params.id, actor);
});
