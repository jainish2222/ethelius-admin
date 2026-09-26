import { api, actorCan } from "@/lib/api/handler";
import { prisma } from "@/lib/prisma";
import { activityFor } from "@/services/audit.service";

type P = { id: string };

/**
 * Everything recorded against the employee and the records hanging off them.
 * Salary and payroll entries carry pay figures, so they only appear for roles cleared to see pay.
 */
export const GET = api<P>({ permission: "employee.read" }, async ({ params, actor }) => {
  const id = params.id;
  const seeSalary = actorCan(actor, "salary.read");
  const seePayroll = actorCan(actor, "payroll.read");
  const [assignments, structures, payrolls, documents] = await Promise.all([
    prisma.projectAssignment.findMany({ where: { employeeId: id }, select: { id: true } }),
    seeSalary ? prisma.salaryStructure.findMany({ where: { employeeId: id }, select: { id: true } }) : [],
    seePayroll ? prisma.payroll.findMany({ where: { employeeId: id }, select: { id: true } }) : [],
    prisma.document.findMany({ where: { employeeId: id }, select: { id: true } }),
  ]);
  const ids = [id, ...[...assignments, ...structures, ...payrolls, ...documents].map((x) => x.id)];
  const rows = await activityFor({ entityIds: ids }, 60);
  return rows.filter((r) => (seeSalary || !r.action.startsWith("salary.")) && (seePayroll || !r.action.startsWith("payroll.")));
});
