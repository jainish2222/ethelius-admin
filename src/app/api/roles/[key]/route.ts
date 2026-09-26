import { api } from "@/lib/api/handler";
import { badRequest } from "@/lib/api/errors";
import { ROLE_LABELS, type RoleKey } from "@/lib/permissions";
import { rolePermissionsSchema } from "@/validations/system";
import { setRolePermissions } from "@/services/user.service";

type P = { key: string };

export const PUT = api<P>({ permission: "user.manage" }, async ({ params, body, actor }) => {
  if (!(params.key in ROLE_LABELS)) throw badRequest("Unknown role.");
  const { permissions } = await body(rolePermissionsSchema);
  await setRolePermissions(params.key as RoleKey, permissions, actor);
  return { ok: true };
});
