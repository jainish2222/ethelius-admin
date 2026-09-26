import { api } from "@/lib/api/handler";
import { previewPayrollHtml } from "@/services/payslip.service";

type P = { id: string };

export const GET = api<P>({ permission: "payroll.read" }, async ({ params, actor }) =>
  new Response(await previewPayrollHtml(params.id, actor), {
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "private, no-store" },
  }),
);
