import { api } from "@/lib/api/handler";
import { companyOptions } from "@/services/company.service";

export const GET = api({ permission: ["company.read", "billing.read", "payment.read", "project.read", "expense.read", "document.read"], mode: "any" }, async () => companyOptions());
