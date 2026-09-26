import { api } from "@/lib/api/handler";
import { bankCreditSchema } from "@/validations/finance";
import { getPayroll, recordBankCredit } from "@/services/payroll.service";

type P = { id: string };

export const POST = api<P>({ permission: "payroll.write" }, async ({ params, body, actor }) => {
  await recordBankCredit(params.id, await body(bankCreditSchema), actor);
  return getPayroll(params.id, actor);
});
