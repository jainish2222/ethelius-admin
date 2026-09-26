import { api } from "@/lib/api/handler";
import { expenseSchema } from "@/validations/business";
import { archiveExpense, updateExpense } from "@/services/expense.service";

type P = { id: string };

export const PUT = api<P>({ permission: ["expense.write", "self.view"], mode: "any" }, async ({ params, body, actor }) => updateExpense(params.id, await body(expenseSchema), actor));

export const DELETE = api<P>({ permission: ["expense.write", "self.view"], mode: "any" }, async ({ params, actor }) => {
  await archiveExpense(params.id, actor);
});
