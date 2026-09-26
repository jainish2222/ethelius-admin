import { api, actorCan, created } from "@/lib/api/handler";
import { forbidden } from "@/lib/api/errors";
import { salaryStructureSchema } from "@/validations/salary";
import { reviseSalary, salaryHistory } from "@/services/salary.service";

type P = { id: string };

export const GET = api<P>({}, async ({ params, actor }) => {
  if (!actorCan(actor, "salary.read") && actor.employeeId !== params.id) throw forbidden();
  return salaryHistory(params.id, actor);
});

export const POST = api<P>({ permission: "salary.write" }, async ({ params, body, actor }) =>
  created(await reviseSalary(params.id, await body(salaryStructureSchema), actor)),
);
