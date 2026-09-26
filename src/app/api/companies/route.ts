import { api, created } from "@/lib/api/handler";
import { parseList } from "@/lib/api/list-query";
import { companySchema } from "@/validations/business";
import { createCompany, listCompanies } from "@/services/company.service";

export const GET = api({ permission: "company.read" }, async ({ query, actor }) => listCompanies(parseList(query), actor));

export const POST = api({ permission: "company.write" }, async ({ body, actor }) => created(await createCompany(await body(companySchema), actor)));
