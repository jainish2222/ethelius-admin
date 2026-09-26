/**
 * Permission catalogue and default role grants.
 * Shared by the server (enforcement) and the client (hiding what a role cannot use).
 * The seed writes these into the Role / Permission / RolePermission tables; at runtime
 * the session loads a user's grants from the database, so an admin can change them.
 */

export const PERMISSIONS = {
  "dashboard.view": { module: "Dashboard", description: "View the dashboard" },
  "dashboard.finance": { module: "Dashboard", description: "See revenue, receipts and payroll figures on the dashboard" },

  "employee.read": { module: "Employees", description: "View employee profiles" },
  "employee.write": { module: "Employees", description: "Create and edit employees" },
  "employee.pii": { module: "Employees", description: "View PAN, UAN, PF, ESIC, date of birth and address" },
  "employee.bank": { module: "Employees", description: "View and edit employee bank accounts" },

  "document.read": { module: "Documents", description: "View and download documents" },
  "document.write": { module: "Documents", description: "Upload, verify and archive documents" },

  "company.read": { module: "Companies", description: "View companies" },
  "company.write": { module: "Companies", description: "Create and edit companies" },

  "project.read": { module: "Projects", description: "View projects" },
  "project.write": { module: "Projects", description: "Create and edit projects" },

  "assignment.read": { module: "Assignments", description: "View project assignments" },
  "assignment.write": { module: "Assignments", description: "Assign employees to projects" },

  "attendance.read": { module: "Attendance", description: "View attendance" },
  "attendance.write": { module: "Attendance", description: "Record attendance" },

  "salary.read": { module: "Salary", description: "View salary structures and history" },
  "salary.write": { module: "Salary", description: "Revise salaries and recurring deductions" },

  "billing.read": { module: "Billing", description: "View invoices and billing" },
  "billing.write": { module: "Billing", description: "Create, send and cancel invoices" },

  "payment.read": { module: "Payments", description: "View client payments" },
  "payment.write": { module: "Payments", description: "Record and reconcile client payments" },

  "payroll.read": { module: "Payroll", description: "View payroll" },
  "payroll.write": { module: "Payroll", description: "Prepare and calculate payroll, record bank credits" },
  "payroll.approve": { module: "Payroll", description: "Approve payroll (locks it)" },

  "payslip.read": { module: "Payslips", description: "View all payslips" },
  "payslip.write": { module: "Payslips", description: "Generate and email payslips" },

  "expense.read": { module: "Expenses", description: "View expenses" },
  "expense.write": { module: "Expenses", description: "Submit and edit expenses" },
  "expense.approve": { module: "Expenses", description: "Approve, reject and mark expenses paid" },

  "report.read": { module: "Reports", description: "View all financial reports" },
  "report.project": { module: "Reports", description: "View project reports" },

  "audit.read": { module: "System", description: "View audit logs" },
  "user.manage": { module: "System", description: "Manage users and role permissions" },
  "settings.manage": { module: "System", description: "Manage company, payslip and deduction settings" },

  "self.view": { module: "Self service", description: "View own profile, payslips and documents" },
} as const;

export type Permission = keyof typeof PERMISSIONS;
export const ALL_PERMISSIONS = Object.keys(PERMISSIONS) as Permission[];

export type RoleKey = "SUPER_ADMIN" | "HR_ADMIN" | "FINANCE_ADMIN" | "PROJECT_MANAGER" | "EMPLOYEE";

export const ROLE_LABELS: Record<RoleKey, string> = {
  SUPER_ADMIN: "Super admin",
  HR_ADMIN: "HR admin",
  FINANCE_ADMIN: "Finance admin",
  PROJECT_MANAGER: "Project manager",
  EMPLOYEE: "Employee",
};

export const DEFAULT_ROLE_GRANTS: Record<RoleKey, Permission[]> = {
  SUPER_ADMIN: ALL_PERMISSIONS,
  HR_ADMIN: [
    "dashboard.view",
    "employee.read", "employee.write", "employee.pii",
    "document.read", "document.write",
    "company.read", "project.read",
    "assignment.read", "assignment.write",
    "attendance.read", "attendance.write",
    "self.view",
  ],
  FINANCE_ADMIN: [
    "dashboard.view", "dashboard.finance",
    "employee.read", "employee.pii", "employee.bank",
    "document.read",
    "company.read", "company.write",
    "project.read",
    "assignment.read",
    "attendance.read",
    "salary.read", "salary.write",
    "billing.read", "billing.write",
    "payment.read", "payment.write",
    "payroll.read", "payroll.write", "payroll.approve",
    "payslip.read", "payslip.write",
    "expense.read", "expense.write", "expense.approve",
    "report.read", "report.project",
    "self.view",
  ],
  PROJECT_MANAGER: [
    "dashboard.view",
    "employee.read",
    "company.read",
    "project.read", "project.write",
    "assignment.read", "assignment.write",
    "expense.read", "expense.write",
    "report.project",
    "self.view",
  ],
  EMPLOYEE: ["self.view"],
};

export function can(granted: readonly string[] | Set<string>, needed: Permission | Permission[], mode: "all" | "any" = "all") {
  const has = (p: Permission) => (granted instanceof Set ? granted.has(p) : granted.includes(p));
  const list = Array.isArray(needed) ? needed : [needed];
  return mode === "all" ? list.every(has) : list.some(has);
}
