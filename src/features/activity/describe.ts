import {
  BadgeIndianRupee, Briefcase, Building2, CalendarCheck, FileCheck2, FileText, FolderKanban, KeyRound, Receipt, ScrollText, Settings, ShieldCheck,
  UserRound, Wallet, Waypoints, type LucideIcon,
} from "lucide-react";
import { formatMoney } from "@/lib/money";
import { monthLabel } from "@/lib/dates";

export type AuditRow = {
  id: string; action: string; entity: string; entityId: string | null; userName: string | null; createdAt: string;
  newValue?: Record<string, unknown> | null; oldValue?: Record<string, unknown> | null;
};

type Described = { text: string; icon: LucideIcon; tone: "success" | "info" | "warning" | "neutral" | "danger" };

const v = (r: AuditRow, k: string) => r.newValue?.[k];
const s = (x: unknown) => (x == null ? "" : String(x));

/** Turns an audit entry into a sentence for activity feeds. */
export function describeAudit(r: AuditRow): Described {
  const month = v(r, "month") ? monthLabel(s(v(r, "month"))) : "";
  switch (r.action) {
    case "payment.recorded":
      return {
        text: `${v(r, "partial") ? "Partial payment" : "Payment"} received from ${s(v(r, "company"))}${v(r, "bankCredit") != null ? ` — ${formatMoney(Number(v(r, "bankCredit")), s(v(r, "currency")) || "INR")} credited` : ""}`,
        icon: BadgeIndianRupee, tone: "success",
      };
    case "payment.reconciled": return { text: "Payment reconciled with the bank statement", icon: BadgeIndianRupee, tone: "success" };
    case "payment.updated": return { text: "Payment details updated", icon: BadgeIndianRupee, tone: "neutral" };
    case "payment.archived": return { text: "Payment archived", icon: BadgeIndianRupee, tone: "warning" };
    case "payroll.approved": return { text: month ? `Payroll approved for ${month}` : "Payroll approved", icon: Wallet, tone: "success" };
    case "payroll.bank_credit_recorded": return { text: month ? `Salaries credited for ${month}` : "Bank credit recorded", icon: Wallet, tone: "success" };
    case "payroll.calculated": return { text: month ? `Payroll calculated for ${month}` : `Payroll calculated${v(r, "employee") ? ` for ${s(v(r, "employee"))}` : ""}`, icon: Wallet, tone: "info" };
    case "payroll.generated": return { text: `Payroll generated for ${month}`, icon: Wallet, tone: "info" };
    case "payroll.edited": return { text: "Payroll lines edited", icon: Wallet, tone: "neutral" };
    case "payroll.cancelled": return { text: "Payroll cancelled", icon: Wallet, tone: "warning" };
    case "payroll.reopened": return { text: "Payroll reopened", icon: Wallet, tone: "neutral" };
    case "payslip.generated":
      return { text: v(r, "count") ? `${s(v(r, "count"))} payslips generated for ${month}` : `Payslip ${s(v(r, "payslipNumber"))} generated`, icon: FileCheck2, tone: "success" };
    case "payslip.regenerated": return { text: `Payslip ${s(v(r, "payslipNumber"))} regenerated`, icon: FileCheck2, tone: "neutral" };
    case "payslip.emailed": return { text: `Payslip emailed to ${s(v(r, "to"))}`, icon: FileCheck2, tone: "info" };
    case "invoice.generated_monthly": return { text: `${s(v(r, "created") ?? "")} invoices generated for ${month}`, icon: Receipt, tone: "info" };
    case "invoice.created": return { text: v(r, "invoiceNumber") ? `Invoice ${s(v(r, "invoiceNumber"))} created` : `${s(v(r, "created"))} invoices raised for ${month}`, icon: Receipt, tone: "info" };
    case "invoice.sent": return { text: "Invoice sent to client", icon: Receipt, tone: "info" };
    case "invoice.cancelled": return { text: "Invoice cancelled", icon: Receipt, tone: "warning" };
    case "invoice.updated": return { text: "Draft invoice updated", icon: Receipt, tone: "neutral" };
    case "employee.created": return { text: `New employee added: ${s(v(r, "fullName"))}`, icon: UserRound, tone: "success" };
    case "employee.updated": return { text: v(r, "status") ? `Employee status changed to ${s(v(r, "status")).replace("_", " ").toLowerCase()}` : "Employee profile updated", icon: UserRound, tone: "neutral" };
    case "employee.archived": return { text: "Employee archived", icon: UserRound, tone: "warning" };
    case "employee.bank_added": return { text: "Bank account added", icon: UserRound, tone: "neutral" };
    case "salary.revised": return { text: `Salary revised${v(r, "annualCtc") ? ` to ${formatMoney(Number(v(r, "annualCtc")), "INR", { decimals: 0 })} CTC` : ""}`, icon: Wallet, tone: "info" };
    case "salary.created": return { text: "Initial salary set", icon: Wallet, tone: "info" };
    case "assignment.created": return { text: `${s(v(r, "employee")) || "Employee"} assigned to ${s(v(r, "project")) || "a project"}`, icon: Waypoints, tone: "info" };
    case "assignment.updated": return { text: "Project assignment updated", icon: Waypoints, tone: "neutral" };
    case "assignment.ended": return { text: `${s(v(r, "employee")) || "Assignment"} rolled off ${s(v(r, "project"))}`.trim(), icon: Waypoints, tone: "neutral" };
    case "project.created": return { text: "Project created", icon: FolderKanban, tone: "success" };
    case "project.updated": return { text: "Project updated", icon: FolderKanban, tone: "neutral" };
    case "company.created": return { text: "Company added", icon: Building2, tone: "success" };
    case "company.updated": return { text: "Company details updated", icon: Building2, tone: "neutral" };
    case "document.uploaded": return { text: `Document uploaded: ${s(v(r, "title"))}`, icon: FileText, tone: "info" };
    case "document.verified": return { text: "Document verified", icon: FileText, tone: "success" };
    case "attendance.recorded":
    case "attendance.updated": return { text: "Attendance recorded", icon: CalendarCheck, tone: "neutral" };
    case "attendance.prefilled": return { text: `Attendance prefilled for ${month}`, icon: CalendarCheck, tone: "neutral" };
    case "expense.submitted": return { text: "Expense submitted", icon: Briefcase, tone: "info" };
    case "expense.approved": return { text: "Expense approved", icon: Briefcase, tone: "success" };
    case "expense.rejected": return { text: "Expense rejected", icon: Briefcase, tone: "danger" };
    case "expense.paid": return { text: "Expense reimbursed", icon: Briefcase, tone: "success" };
    case "user.created": return { text: "User account created", icon: ShieldCheck, tone: "info" };
    case "user.updated": return { text: "User account updated", icon: ShieldCheck, tone: "neutral" };
    case "role.permissions_updated": return { text: "Role permissions changed", icon: ShieldCheck, tone: "warning" };
    case "settings.updated": return { text: "Settings updated", icon: Settings, tone: "neutral" };
    case "auth.login": return { text: "Signed in", icon: KeyRound, tone: "neutral" };
    case "auth.login_failed": return { text: "Failed sign-in attempt", icon: KeyRound, tone: "danger" };
    case "export.downloaded": return { text: `Exported ${r.entityId ?? "data"}`, icon: ScrollText, tone: "neutral" };
    default: return { text: r.action.replace(/[._]/g, " "), icon: ScrollText, tone: "neutral" };
  }
}
