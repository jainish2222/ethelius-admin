import { api } from "@/lib/api/handler";
import { deductionRuleSchema } from "@/validations/salary";
import { saveRule } from "@/services/salary.service";

type P = { id: string };

export const PUT = api<P>({ permission: "payroll.approve" }, async ({ params, body, actor }) => saveRule(params.id, await body(deductionRuleSchema), actor));
