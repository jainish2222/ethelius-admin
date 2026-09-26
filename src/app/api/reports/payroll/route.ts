import { api } from "@/lib/api/handler";
import { parseList } from "@/lib/api/list-query";
import { payrollReport } from "@/services/report.service";

export const GET = api({ permission: "report.read" }, async ({ query }) => payrollReport(parseList(query)));
