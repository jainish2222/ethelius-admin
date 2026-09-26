import { api } from "@/lib/api/handler";
import { expenseDecisionSchema } from "@/validations/business";
import { decideExpense } from "@/services/expense.service";

type P = { id: string };

export const POST = api<P>({ permission: "expense.approve" }, async ({ params, body, actor }) => decideExpense(params.id, await body(expenseDecisionSchema), actor));
