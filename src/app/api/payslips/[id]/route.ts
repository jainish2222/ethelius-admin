import { api } from "@/lib/api/handler";
import { archivePayslip, getPayslip } from "@/services/payslip.service";

type P = { id: string };

export const GET = api<P>({ permission: ["payslip.read", "self.view"], mode: "any" }, async ({ params, actor }) => {
  const { snapshot, ...slip } = await getPayslip(params.id, actor);
  const s = snapshot as { net?: number; gross?: number; totalDeductions?: number };
  return { ...slip, net: s.net, gross: s.gross, totalDeductions: s.totalDeductions };
});

export const DELETE = api<P>({ permission: "payslip.write" }, async ({ params, actor }) => {
  await archivePayslip(params.id, actor);
});
