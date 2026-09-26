import { z } from "zod";
import { api } from "@/lib/api/handler";
import { archiveDocument, verifyDocument } from "@/services/document.service";

type P = { id: string };

export const PATCH = api<P>({ permission: "document.write" }, async ({ params, body, actor }) => {
  const { verified } = await body(z.object({ verified: z.boolean() }));
  await verifyDocument(params.id, verified, actor);
  return { ok: true };
});

export const DELETE = api<P>({ permission: "document.write" }, async ({ params, actor }) => {
  await archiveDocument(params.id, actor);
});
