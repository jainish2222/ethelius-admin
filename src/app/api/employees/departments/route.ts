import { api } from "@/lib/api/handler";
import { departments } from "@/services/employee.service";

export const GET = api({ permission: ["employee.read", "payroll.read"], mode: "any" }, async () => departments());
