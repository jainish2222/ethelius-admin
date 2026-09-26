import { api, created } from "@/lib/api/handler";
import { bankAccountSchema } from "@/validations/employee";
import { addBankAccount } from "@/services/employee.service";

type P = { id: string };

export const POST = api<P>({ permission: "employee.bank" }, async ({ params, body, actor }) =>
  created(await addBankAccount(params.id, await body(bankAccountSchema), actor)),
);
