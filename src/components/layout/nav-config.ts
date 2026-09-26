import {
  BarChart3, Briefcase, Building2, CalendarCheck, CreditCard, FileSpreadsheet, FileText, FolderKanban, Landmark, LayoutDashboard,
  LineChart, Receipt, ScrollText, Settings, ShieldCheck, TrendingUp, UserRound, Users, Wallet, Waypoints, type LucideIcon,
} from "lucide-react";
import type { Permission } from "@/lib/permissions";

export type NavItem = { label: string; href: string; icon: LucideIcon; permission?: Permission | Permission[]; match?: string[] };
export type NavSection = { title: string; items: NavItem[] };

export const NAV: NavSection[] = [
  { title: "Overview", items: [{ label: "Dashboard", href: "/dashboard", icon: LayoutDashboard, permission: "dashboard.view" }] },
  {
    title: "Workforce",
    items: [
      { label: "Employees", href: "/employees", icon: Users, permission: "employee.read" },
      { label: "Attendance", href: "/attendance", icon: CalendarCheck, permission: "attendance.read" },
      { label: "Documents", href: "/documents", icon: FileText, permission: "document.read" },
    ],
  },
  {
    title: "Business",
    items: [
      { label: "Companies", href: "/companies", icon: Building2, permission: "company.read" },
      { label: "Projects", href: "/projects", icon: FolderKanban, permission: "project.read" },
      { label: "Assignments", href: "/assignments", icon: Waypoints, permission: "assignment.read" },
    ],
  },
  {
    title: "Finance",
    items: [
      { label: "Monthly billing", href: "/billing", icon: FileSpreadsheet, permission: "billing.read" },
      { label: "Invoices", href: "/invoices", icon: Receipt, permission: "billing.read" },
      { label: "Client payments", href: "/payments", icon: CreditCard, permission: "payment.read" },
      { label: "Payroll", href: "/payroll", icon: Wallet, permission: "payroll.read" },
      { label: "Bank payments", href: "/bank-payments", icon: Landmark, permission: "payroll.read" },
      { label: "Payslips", href: "/payslips", icon: ScrollText, permission: "payslip.read" },
      { label: "Expenses", href: "/expenses", icon: Briefcase, permission: "expense.read" },
    ],
  },
  {
    title: "Reports",
    items: [
      { label: "Revenue", href: "/reports/revenue", icon: TrendingUp, permission: "report.read" },
      { label: "Payments", href: "/reports/payments", icon: LineChart, permission: "report.read" },
      { label: "Payroll", href: "/reports/payroll", icon: BarChart3, permission: "report.read" },
      { label: "Project profitability", href: "/reports/profitability", icon: FolderKanban, permission: ["report.read", "report.project"] },
    ],
  },
  {
    title: "System",
    items: [
      { label: "Users & roles", href: "/users", icon: ShieldCheck, permission: "user.manage" },
      { label: "Audit logs", href: "/audit-logs", icon: ScrollText, permission: "audit.read" },
      { label: "Settings", href: "/settings", icon: Settings },
    ],
  },
];

/** Self-service links for people without the admin view of the same module. */
export function selfNav(employeeId: string | null, has: (p: Permission) => boolean): NavSection | null {
  if (!employeeId || !has("self.view")) return null;
  const items: NavItem[] = [];
  if (!has("employee.read")) items.push({ label: "My profile", href: `/employees/${employeeId}`, icon: UserRound });
  if (!has("payslip.read")) items.push({ label: "My payslips", href: "/payslips", icon: ScrollText });
  if (!has("expense.read")) items.push({ label: "My expenses", href: "/expenses", icon: Briefcase });
  if (!has("document.read")) items.push({ label: "My documents", href: "/documents", icon: FileText });
  return items.length ? { title: "My space", items } : null;
}
