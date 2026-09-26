import { api } from "@/lib/api/handler";
import { removeContact } from "@/services/company.service";

type P = { id: string; contactId: string };

export const DELETE = api<P>({ permission: "company.write" }, async ({ params, actor }) => {
  await removeContact(params.id, params.contactId, actor);
});
