import { api, created } from "@/lib/api/handler";
import { parseList } from "@/lib/api/list-query";
import { employeeSchema } from "@/validations/employee";
import { createEmployee, listEmployees } from "@/services/employee.service";

export const GET = api({ permission: ["employee.read", "self.view"], mode: "any" }, async ({ query, actor }) => listEmployees(parseList(query), actor));

export const POST = api({ permission: "employee.write" }, async ({ body, actor }) => created(await createEmployee(await body(employeeSchema), actor)));
