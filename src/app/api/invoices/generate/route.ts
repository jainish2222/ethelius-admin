import { api } from "@/lib/api/handler";
import { generateInvoicesSchema } from "@/validations/finance";
import { generateMonthlyInvoices } from "@/services/invoice.service";

export const POST = api({ permission: "billing.write" }, async ({ body, actor }) => {
  const { month, projectIds, send } = await body(generateInvoicesSchema);
  return generateMonthlyInvoices(month, projectIds, send, actor);
});
