import { api, created } from "@/lib/api/handler";
import { deductionRuleSchema } from "@/validations/salary";
import { listRules, saveRule } from "@/services/salary.service";

export const GET = api({ permission: ["payroll.read", "settings.manage"], mode: "any" }, async () => listRules());

export const POST = api({ permission: "payroll.approve" }, async ({ body, actor }) => created(await saveRule(null, await body(deductionRuleSchema), actor)));
