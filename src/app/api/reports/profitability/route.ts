import { api } from "@/lib/api/handler";
import { parseList } from "@/lib/api/list-query";
import { profitabilityReport } from "@/services/report.service";

export const GET = api({ permission: ["report.read", "report.project"], mode: "any" }, async ({ query }) => profitabilityReport(parseList(query)));
