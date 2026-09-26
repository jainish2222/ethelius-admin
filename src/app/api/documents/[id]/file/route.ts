import { api } from "@/lib/api/handler";
import { fileResponse } from "@/lib/storage";
import { getDocumentFile } from "@/services/document.service";

type P = { id: string };

export const GET = api<P>({ permission: ["document.read", "self.view"], mode: "any" }, async ({ params, actor, query }) => {
  const doc = await getDocumentFile(params.id, actor);
  return fileResponse(doc.filePath, doc.fileName, query.download !== "1");
});
