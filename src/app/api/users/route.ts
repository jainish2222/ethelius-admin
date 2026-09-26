import { api, created } from "@/lib/api/handler";
import { userCreateSchema } from "@/validations/system";
import { createUser, listUsers } from "@/services/user.service";

export const GET = api({ permission: "user.manage" }, async () => listUsers());

export const POST = api({ permission: "user.manage" }, async ({ body, actor }) => created(await createUser(await body(userCreateSchema), actor)));
