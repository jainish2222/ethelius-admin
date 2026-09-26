import { api } from "@/lib/api/handler";
import { userUpdateSchema } from "@/validations/system";
import { updateUser } from "@/services/user.service";

type P = { id: string };

export const PUT = api<P>({ permission: "user.manage" }, async ({ params, body, actor }) => {
  await updateUser(params.id, await body(userUpdateSchema), actor);
  return { ok: true };
});
