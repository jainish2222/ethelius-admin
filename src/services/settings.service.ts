import "server-only";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import type { Actor } from "@/lib/api/handler";
import { DEFAULT_COMPANY_PROFILE, DEFAULT_PAYSLIP_TEMPLATE, SETTING_KEYS } from "@/features/settings/defaults";

export { DEFAULT_COMPANY_PROFILE, DEFAULT_PAYSLIP_TEMPLATE, SETTING_KEYS };

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const row = await prisma.setting.findUnique({ where: { key } });
  if (!row) return fallback;
  return (typeof fallback === "object" && fallback !== null && !Array.isArray(fallback)
    ? { ...fallback, ...(row.value as object) }
    : row.value) as T;
}

export async function setSetting(key: string, value: unknown, actor: Actor | null) {
  const before = await prisma.setting.findUnique({ where: { key } });
  await prisma.setting.upsert({
    where: { key },
    create: { key, value: value as object, updatedById: actor?.userId },
    update: { value: value as object, updatedById: actor?.userId },
  });
  if (actor) await audit(actor, { action: "settings.updated", entity: "Setting", entityId: key, oldValue: before?.value, newValue: value });
}

export const getCompanyProfile = () => getSetting(SETTING_KEYS.companyProfile, DEFAULT_COMPANY_PROFILE);
export const getPayslipTemplate = () => getSetting(SETTING_KEYS.payslipTemplate, DEFAULT_PAYSLIP_TEMPLATE);

/** Logo and signature are small images kept as data URLs so the payslip renders self-contained. */
export const getBrandImages = async () => ({
  logo: await getSetting<string>(SETTING_KEYS.companyLogo, ""),
  signature: await getSetting<string>(SETTING_KEYS.signatureImage, ""),
});
