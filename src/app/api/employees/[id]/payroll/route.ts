import { api } from "@/lib/api/handler";
import { assertEmployeeAccess } from "@/services/employee.service";
import { employeePayrollHistory } from "@/services/payroll.service";

type P = { id: string };

export const GET = api<P>({}, async ({ params, actor }) => {
  assertEmployeeAccess(actor, params.id);
  return employeePayrollHistory(params.id, actor);
});
