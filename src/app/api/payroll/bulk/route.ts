import { api } from "@/lib/api/handler";
import { payrollBulkSchema } from "@/validations/finance";
import { bulkPayrollAction } from "@/services/payroll.service";

export const POST = api({ permission: "payroll.write" }, async ({ body, actor }) => {
  const { month, action, ids } = await body(payrollBulkSchema);
  return bulkPayrollAction(month, action, ids, actor);
});
