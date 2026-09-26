import { api, created } from "@/lib/api/handler";
import { badRequest } from "@/lib/api/errors";
import { parseList } from "@/lib/api/list-query";
import { listDocuments, uploadDocument } from "@/services/document.service";

export const GET = api({ permission: ["document.read", "self.view"], mode: "any" }, async ({ query, actor }) => listDocuments(parseList(query), actor));

export const POST = api({ permission: ["document.write", "self.view"], mode: "any" }, async ({ req, actor }) => {
  const form = await req.formData().catch(() => null);
  if (!form) throw badRequest("Send the document as multipart form data.");
  return created(await uploadDocument(form, actor));
});
