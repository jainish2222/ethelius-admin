import { api } from "@/lib/api/handler";
import { employeeOptions } from "@/services/employee.service";

export const GET = api({}, async ({ actor, query }) => employeeOptions(actor, { includeInactive: query.all === "true" }));
