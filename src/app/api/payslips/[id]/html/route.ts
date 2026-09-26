import { api } from "@/lib/api/handler";
import { payslipHtml } from "@/services/payslip.service";

type P = { id: string };

export const GET = api<P>({ permission: ["payslip.read", "self.view"], mode: "any" }, async ({ params, actor, query }) =>
  new Response(await payslipHtml(params.id, actor, query.mode === "print" ? "print" : "screen"), {
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "private, no-store" },
  }),
);
