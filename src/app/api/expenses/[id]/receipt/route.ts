import { api } from "@/lib/api/handler";
import { badRequest } from "@/lib/api/errors";
import { fileResponse } from "@/lib/storage";
import { attachReceipt, receiptPath } from "@/services/expense.service";

type P = { id: string };

export const GET = api<P>({ permission: ["expense.read", "self.view"], mode: "any" }, async ({ params, actor }) => fileResponse(await receiptPath(params.id, actor)));

export const POST = api<P>({ permission: ["expense.write", "self.view"], mode: "any" }, async ({ params, req, actor }) => {
  const file = (await req.formData().catch(() => null))?.get("file");
  if (!(file instanceof File)) throw badRequest("Choose a receipt to upload.");
  await attachReceipt(params.id, file, actor);
  return { ok: true };
});
