import { api } from "@/lib/api/handler";
import { parseList } from "@/lib/api/list-query";
import { revenueReport } from "@/services/report.service";

export const GET = api({ permission: "report.read" }, async ({ query }) => revenueReport(parseList(query)));
