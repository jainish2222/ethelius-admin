import { api } from "@/lib/api/handler";
import { badRequest } from "@/lib/api/errors";
import { IMAGE_TYPES } from "@/lib/storage";
import { setSetting, SETTING_KEYS } from "@/services/settings.service";

const MAX = 400 * 1024;

/**
 * Logo and signature images. They are small, so they are stored as data URLs in settings:
 * that keeps every payslip PDF self-contained, with no file lookups while rendering.
 */
export const POST = api({ permission: ["settings.manage", "payslip.write"], mode: "any" }, async ({ req, actor }) => {
  const form = await req.formData().catch(() => null);
  const kind = form?.get("kind");
  const file = form?.get("file");
  if (kind !== "logo" && kind !== "signature") throw badRequest("Say whether this is the logo or the signature.");
  if (!(file instanceof File)) throw badRequest("Choose an image to upload.");
  if (!IMAGE_TYPES.includes(file.type)) throw badRequest("Upload a PNG, JPG or WebP image.");
  if (file.size > MAX) throw badRequest("Keep the image under 400 KB.");
  const dataUrl = `data:${file.type};base64,${Buffer.from(await file.arrayBuffer()).toString("base64")}`;
  await setSetting(kind === "logo" ? SETTING_KEYS.companyLogo : SETTING_KEYS.signatureImage, dataUrl, actor);
  return { ok: true };
});

export const DELETE = api({ permission: ["settings.manage", "payslip.write"], mode: "any" }, async ({ query, actor }) => {
  if (query.kind !== "logo" && query.kind !== "signature") throw badRequest("Say which image to remove.");
  await setSetting(query.kind === "logo" ? SETTING_KEYS.companyLogo : SETTING_KEYS.signatureImage, "", actor);
});
