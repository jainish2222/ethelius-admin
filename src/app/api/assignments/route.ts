import { api, created } from "@/lib/api/handler";
import { parseList } from "@/lib/api/list-query";
import { assignmentSchema } from "@/validations/business";
import { createAssignment, listAssignments } from "@/services/assignment.service";

export const GET = api({ permission: "assignment.read" }, async ({ query, actor }) => listAssignments(parseList(query), actor));

export const POST = api({ permission: "assignment.write" }, async ({ body, actor }) => created(await createAssignment(await body(assignmentSchema), actor)));
