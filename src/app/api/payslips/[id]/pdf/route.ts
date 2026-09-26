import { api } from "@/lib/api/handler";
import { payslipPdf } from "@/services/payslip.service";

type P = { id: string };

export const GET = api<P>({ permission: ["payslip.read", "self.view"], mode: "any" }, async ({ params, actor, query }) => {
  const { buffer, name } = await payslipPdf(params.id, actor);
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${query.download === "1" ? "attachment" : "inline"}; filename="${name}"`,
      "Cache-Control": "private, no-store",
    },
  });
});
