import { api } from "@/lib/api/handler";
import { payslipEmailSchema } from "@/validations/finance";
import { emailPayslip } from "@/services/payslip.service";

type P = { id: string };

export const POST = api<P>({ permission: "payslip.write" }, async ({ params, body, actor }) => {
  const { to } = await body(payslipEmailSchema);
  return emailPayslip(params.id, to, actor);
});
