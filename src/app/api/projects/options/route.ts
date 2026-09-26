import { api } from "@/lib/api/handler";
import { projectOptions } from "@/services/project.service";

export const GET = api(
  { permission: ["project.read", "billing.read", "payment.read", "assignment.read", "expense.read", "expense.write", "document.read", "report.read"], mode: "any" },
  async () => projectOptions(),
);
