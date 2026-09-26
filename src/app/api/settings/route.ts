import { z } from "zod";
import { api, actorCan } from "@/lib/api/handler";
import { forbidden } from "@/lib/api/errors";
import { companyProfileSchema, payslipTemplateSchema } from "@/validations/system";
import {
  getBrandImages, getCompanyProfile, getPayslipTemplate, setSetting, SETTING_KEYS,
} from "@/services/settings.service";

export const GET = api({ permission: ["settings.manage", "payslip.write"], mode: "any" }, async () => {
  const [companyProfile, payslipTemplate, images] = await Promise.all([getCompanyProfile(), getPayslipTemplate(), getBrandImages()]);
  return { companyProfile, payslipTemplate, logo: images.logo, signature: images.signature };
});

const updateSchema = z.discriminatedUnion("section", [
  z.object({ section: z.literal("company"), value: companyProfileSchema }),
  z.object({ section: z.literal("payslip"), value: payslipTemplateSchema }),
]);

export const PUT = api({}, async ({ body, actor }) => {
  const input = await body(updateSchema);
  // Company details need settings.manage; the payslip layout can also be tuned by payroll owners.
  if (input.section === "company" && !actorCan(actor, "settings.manage")) throw forbidden();
  if (input.section === "payslip" && !actorCan(actor, ["settings.manage", "payslip.write"], "any")) throw forbidden();
  await setSetting(input.section === "company" ? SETTING_KEYS.companyProfile : SETTING_KEYS.payslipTemplate, input.value, actor);
  return { ok: true };
});
