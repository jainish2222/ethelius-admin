import { api } from "@/lib/api/handler";
import { recurringDeductionSchema } from "@/validations/salary";
import { updateRecurring } from "@/services/salary.service";

type P = { id: string; rid: string };

export const PUT = api<P>({ permission: "salary.write" }, async ({ params, body, actor }) =>
  updateRecurring(params.id, params.rid, await body(recurringDeductionSchema), actor),
);
