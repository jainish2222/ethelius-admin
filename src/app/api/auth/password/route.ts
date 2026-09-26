import { api } from "@/lib/api/handler";
import { changePasswordSchema } from "@/validations/system";
import { changePassword } from "@/services/auth.service";

export const POST = api({}, async ({ actor, body }) => {
  const { currentPassword, newPassword } = await body(changePasswordSchema);
  await changePassword(actor, currentPassword, newPassword);
  return { ok: true };
});
