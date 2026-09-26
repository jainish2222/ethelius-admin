import { api, created } from "@/lib/api/handler";
import { recurringDeductionSchema } from "@/validations/salary";
import { addRecurring } from "@/services/salary.service";

type P = { id: string };

export const POST = api<P>({ permission: "salary.write" }, async ({ params, body, actor }) =>
  created(await addRecurring(params.id, await body(recurringDeductionSchema), actor)),
);
