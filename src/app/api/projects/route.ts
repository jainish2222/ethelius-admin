import { api, created } from "@/lib/api/handler";
import { parseList } from "@/lib/api/list-query";
import { projectSchema } from "@/validations/business";
import { createProject, listProjects } from "@/services/project.service";

export const GET = api({ permission: "project.read" }, async ({ query, actor }) => listProjects(parseList(query), actor));

export const POST = api({ permission: "project.write" }, async ({ body, actor }) => created(await createProject(await body(projectSchema), actor)));
