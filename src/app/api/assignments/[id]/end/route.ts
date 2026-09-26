import { z } from "zod";
import { api } from "@/lib/api/handler";
import { optDate } from "@/validations/common";
import { endAssignment } from "@/services/assignment.service";

type P = { id: string };

export const POST = api<P>({ permission: "assignment.write" }, async ({ params, body, actor }) => {
  const { endDate } = await body(z.object({ endDate: optDate }));
  return endAssignment(params.id, endDate, actor);
});
