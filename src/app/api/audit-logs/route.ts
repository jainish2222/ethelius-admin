import { api } from "@/lib/api/handler";
import { parseList } from "@/lib/api/list-query";
import { listAuditLogs } from "@/services/audit.service";

export const GET = api({ permission: "audit.read" }, async ({ query }) => listAuditLogs(parseList(query)));
