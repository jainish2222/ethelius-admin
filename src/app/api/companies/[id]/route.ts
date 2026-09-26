import { api } from "@/lib/api/handler";
import { companySchema } from "@/validations/business";
import { archiveCompany, getCompany, updateCompany } from "@/services/company.service";

type P = { id: string };

export const GET = api<P>({ permission: "company.read" }, async ({ params, actor }) => getCompany(params.id, actor));

export const PUT = api<P>({ permission: "company.write" }, async ({ params, body, actor }) => updateCompany(params.id, await body(companySchema), actor));

export const DELETE = api<P>({ permission: "company.write" }, async ({ params, actor }) => {
  await archiveCompany(params.id, actor);
});
