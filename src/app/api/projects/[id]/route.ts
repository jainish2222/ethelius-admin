import { api } from "@/lib/api/handler";
import { projectSchema } from "@/validations/business";
import { archiveProject, getProject, updateProject } from "@/services/project.service";

type P = { id: string };

export const GET = api<P>({ permission: "project.read" }, async ({ params, actor }) => getProject(params.id, actor));

export const PUT = api<P>({ permission: "project.write" }, async ({ params, body, actor }) => updateProject(params.id, await body(projectSchema), actor));

export const DELETE = api<P>({ permission: "project.write" }, async ({ params, actor }) => {
  await archiveProject(params.id, actor);
});
