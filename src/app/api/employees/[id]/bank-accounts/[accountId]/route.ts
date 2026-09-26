import { api } from "@/lib/api/handler";
import { archiveBankAccount } from "@/services/employee.service";

type P = { id: string; accountId: string };

export const DELETE = api<P>({ permission: "employee.bank" }, async ({ params, actor }) => {
  await archiveBankAccount(params.id, params.accountId, actor);
});
