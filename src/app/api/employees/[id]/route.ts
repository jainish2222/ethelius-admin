import { api } from "@/lib/api/handler";
import { employeeSchema } from "@/validations/employee";
import { archiveEmployee, getEmployee, updateEmployee } from "@/services/employee.service";

type P = { id: string };

export const GET = api<P>({}, async ({ params, actor }) => getEmployee(params.id, actor));

export const PUT = api<P>({ permission: "employee.write" }, async ({ params, body, actor }) => updateEmployee(params.id, await body(employeeSchema), actor));

export const DELETE = api<P>({ permission: "employee.write" }, async ({ params, actor }) => {
  await archiveEmployee(params.id, actor);
});
