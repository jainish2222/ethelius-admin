import { api } from "@/lib/api/handler";
import { badRequest } from "@/lib/api/errors";
import { fileResponse } from "@/lib/storage";
import { getEmployeePhotoPath, setEmployeePhoto } from "@/services/employee.service";

type P = { id: string };

export const GET = api<P>({}, async ({ params, actor }) => fileResponse(await getEmployeePhotoPath(params.id, actor)));

export const POST = api<P>({ permission: "employee.write" }, async ({ params, req, actor }) => {
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) throw badRequest("Choose an image to upload.");
  await setEmployeePhoto(params.id, file, actor);
  return { ok: true };
});
