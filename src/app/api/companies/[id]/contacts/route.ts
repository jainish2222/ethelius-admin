import { api, created } from "@/lib/api/handler";
import { companyContactSchema } from "@/validations/business";
import { addContact } from "@/services/company.service";

type P = { id: string };

export const POST = api<P>({ permission: "company.write" }, async ({ params, body, actor }) =>
  created(await addContact(params.id, await body(companyContactSchema), actor)),
);
