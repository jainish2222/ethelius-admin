import { api, created } from "@/lib/api/handler";
import { parseList } from "@/lib/api/list-query";
import { expenseSchema } from "@/validations/business";
import { createExpense, listExpenses } from "@/services/expense.service";

export const GET = api({ permission: ["expense.read", "self.view"], mode: "any" }, async ({ query, actor }) => listExpenses(parseList(query), actor));

export const POST = api({ permission: ["expense.write", "self.view"], mode: "any" }, async ({ body, actor }) => created(await createExpense(await body(expenseSchema), actor)));
