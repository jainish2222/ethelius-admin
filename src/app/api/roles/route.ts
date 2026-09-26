import { api } from "@/lib/api/handler";
import { listRoles } from "@/services/user.service";

export const GET = api({ permission: "user.manage" }, async () => listRoles());
