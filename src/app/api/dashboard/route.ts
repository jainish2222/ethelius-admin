import { api } from "@/lib/api/handler";
import { dashboard } from "@/services/dashboard.service";

export const GET = api({ permission: "dashboard.view" }, async ({ actor }) => dashboard(actor));
