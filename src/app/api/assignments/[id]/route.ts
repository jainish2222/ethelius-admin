import { api } from "@/lib/api/handler";
import { assignmentSchema } from "@/validations/business";
import { updateAssignment } from "@/services/assignment.service";

type P = { id: string };

export const PUT = api<P>({ permission: "assignment.write" }, async ({ params, body, actor }) => updateAssignment(params.id, await body(assignmentSchema), actor));
