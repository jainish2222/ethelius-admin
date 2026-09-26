import "server-only";
import ExcelJS from "exceljs";
import { jsPDF } from "jspdf";
import { autoTable } from "jspdf-autotable";
import { actorCan, requirePermission, type Actor } from "@/lib/api/handler";
import { badRequest } from "@/lib/api/errors";
import type { ListQuery } from "@/lib/api/list-query";
import type { Permission } from "@/lib/permissions";
import { formatDate, formatDateTime, monthLabel } from "@/lib/dates";
import { round2 } from "@/lib/money";
import { serialize } from "@/lib/serialize";
import {
  ASSIGNMENT_STATUS, COMPANY_STATUS, DOCUMENT_TYPE, EMPLOYEE_STATUS, EMPLOYMENT_TYPE, EXPENSE_STATUS, EXPENSE_TYPE,
  INVOICE_STATUS, PAYMENT_METHOD, PAYMENT_STATUS, PAYMENT_TERMS, PAYROLL_STATUS, PROJECT_STATUS, SALARY_PAYMENT_STATUS, STATUS_LABELS, label,
} from "@/lib/constants";
import { listEmployees } from "./employee.service";
import { listCompanies } from "./company.service";
import { listProjects } from "./project.service";
import { listAssignments } from "./assignment.service";
import { listInvoices } from "./invoice.service";
import { listPayments, paymentTracker } from "./payment.service";
import { listPayroll } from "./payroll.service";
import { listPayslips } from "./payslip.service";
import { listExpenses } from "./expense.service";
import { listDocuments } from "./document.service";
import { listAuditLogs } from "./audit.service";
import { payrollReport, profitabilityReport, revenueReport } from "./report.service";

type Kind = "text" | "money" | "date" | "number" | "percent" | "month" | "datetime";
type Col = { header: string; kind?: Kind; get: (r: any) => unknown }; // eslint-disable-line @typescript-eslint/no-explicit-any
type Source = { title: string; permission: Permission | Permission[]; mode?: "all" | "any"; load: (q: ListQuery, a: Actor) => Promise<{ data: unknown[] }>; columns: Col[] };

const t = (header: string, get: Col["get"]): Col => ({ header, get });
const m = (header: string, get: Col["get"]): Col => ({ header, kind: "money", get });
const d = (header: string, get: Col["get"]): Col => ({ header, kind: "date", get });
const mo = (header: string, get: Col["get"]): Col => ({ header, kind: "month", get });

const SOURCES: Record<string, Source> = {
  employees: {
    title: "Employees", permission: "employee.read", load: listEmployees,
    columns: [
      t("Employee ID", (r) => r.employeeCode), t("Name", (r) => r.fullName), t("Designation", (r) => r.designation),
      t("Department", (r) => r.department), t("Employment type", (r) => label(EMPLOYMENT_TYPE, r.employmentType)),
      t("Status", (r) => label(EMPLOYEE_STATUS, r.status)), d("Joining date", (r) => r.joiningDate),
      t("Official email", (r) => r.officialEmail), t("Phone", (r) => r.phone),
      t("Projects", (r) => r.projects.map((p: { name: string; allocation: number }) => `${p.name} (${p.allocation}%)`).join("; ")),
    ],
  },
  companies: {
    title: "Companies", permission: "company.read", load: listCompanies,
    columns: [
      t("Company", (r) => r.name), t("Legal name", (r) => r.legalName), t("Status", (r) => label(COMPANY_STATUS, r.status)),
      t("Billing contact", (r) => r.billingContactName), t("Billing email", (r) => r.billingEmail),
      t("Payment terms", (r) => label(PAYMENT_TERMS, r.paymentTerms)), t("Currency", (r) => r.currency),
      d("Contract end", (r) => r.contractEnd), { header: "Projects", kind: "number", get: (r) => r.projectCount },
      m("Invoiced", (r) => r.invoiced), m("Received", (r) => r.received), m("Outstanding", (r) => r.outstanding),
    ],
  },
  projects: {
    title: "Projects", permission: "project.read", load: listProjects,
    columns: [
      t("Code", (r) => r.code), t("Project", (r) => r.name), t("Company", (r) => r.company.name), t("Manager", (r) => r.manager?.fullName),
      t("Status", (r) => label(PROJECT_STATUS, r.status)), t("Billing type", (r) => r.billingType), m("Monthly billing", (r) => r.monthlyBillingAmount),
      d("Start", (r) => r.startDate), d("End", (r) => r.endDate), { header: "Headcount", kind: "number", get: (r) => r.headcount },
      m("Invoiced", (r) => r.invoiced), m("Received", (r) => r.received), m("Outstanding", (r) => r.outstanding),
    ],
  },
  assignments: {
    title: "Project assignments", permission: "assignment.read", load: listAssignments,
    columns: [
      t("Employee", (r) => r.employee.fullName), t("Employee ID", (r) => r.employee.employeeCode), t("Project", (r) => r.project.name),
      t("Company", (r) => r.project.company.name), t("Role", (r) => r.role), d("Start", (r) => r.startDate), d("End", (r) => r.endDate),
      { header: "Allocation %", kind: "number", get: (r) => r.allocationPercent }, m("Billing rate", (r) => r.billingRate),
      m("Employee cost", (r) => r.employeeCost), t("Status", (r) => label(ASSIGNMENT_STATUS, r.status)),
    ],
  },
  invoices: {
    title: "Invoices", permission: "billing.read", load: listInvoices,
    columns: [
      t("Invoice", (r) => r.invoiceNumber), t("Company", (r) => r.company.name), t("Project", (r) => r.project?.name), mo("Billing month", (r) => r.billingMonth),
      d("Invoice date", (r) => r.invoiceDate), d("Due date", (r) => r.dueDate), t("Currency", (r) => r.currency),
      m("Amount", (r) => r.subtotal), m("Tax", (r) => r.taxAmount), m("Discount", (r) => r.discountAmount), m("Total", (r) => r.total),
      m("Received", (r) => r.amountSettled), m("Outstanding", (r) => r.outstanding), t("Status", (r) => label(INVOICE_STATUS, r.status)),
    ],
  },
  payments: {
    title: "Client payments", permission: "payment.read", load: listPayments,
    columns: [
      d("Payment date", (r) => r.paymentDate), t("Company", (r) => r.company.name), t("Project", (r) => r.project?.name), t("Invoice", (r) => r.invoice?.invoiceNumber),
      m("Amount settled", (r) => r.amountReceived), m("TDS", (r) => r.tdsDeducted), m("Other deduction", (r) => r.otherDeduction), m("Bank credit", (r) => r.bankCredit),
      t("Method", (r) => label(PAYMENT_METHOD, r.method)), t("Reference", (r) => r.transactionRef), t("UTR", (r) => r.utr), t("Status", (r) => label(PAYMENT_STATUS, r.status)),
    ],
  },
  "payment-tracker": {
    title: "Payment tracker", permission: "payment.read", load: paymentTracker,
    columns: [
      t("Company", (r) => r.company.name), t("Project", (r) => r.project?.name), mo("Month", (r) => r.month), t("Invoice", (r) => r.invoiceNumber),
      m("Invoice amount", (r) => r.invoiced), m("Expected", (r) => r.expected), m("Received", (r) => r.received), m("Deductions", (r) => r.deductions),
      m("Bank credit", (r) => r.bankCredit), m("Outstanding", (r) => r.outstanding), d("Due date", (r) => r.dueDate), t("Status", (r) => STATUS_LABELS[r.status] ?? r.status),
    ],
  },
  payroll: {
    title: "Payroll", permission: "payroll.read", load: listPayroll,
    columns: [
      mo("Month", (r) => r.month), t("Employee ID", (r) => r.employee.employeeCode), t("Employee", (r) => r.employee.fullName),
      { header: "Paid days", kind: "number", get: (r) => r.paidDays }, m("Gross", (r) => r.grossEarnings), m("PF", (r) => r.pf), m("PT", (r) => r.pt), m("TDS", (r) => r.tds),
      m("Total deductions", (r) => r.totalDeductions), m("Net salary", (r) => r.netSalary), m("Bank credit", (r) => r.actualBankCredit),
      d("Credit date", (r) => r.bankCreditDate), t("Reference", (r) => r.transactionRef), t("Status", (r) => label(PAYROLL_STATUS, r.status)),
      t("Payment", (r) => label(SALARY_PAYMENT_STATUS, r.paymentStatus)),
    ],
  },
  payslips: {
    title: "Payslips", permission: "payslip.read", load: listPayslips,
    columns: [
      t("Payslip", (r) => r.payslipNumber), mo("Month", (r) => r.month), t("Employee", (r) => r.employee.fullName), t("Employee ID", (r) => r.employee.employeeCode),
      m("Net salary", (r) => r.payroll.netSalary), m("Bank credit", (r) => r.payroll.actualBankCredit), { header: "Generated", kind: "datetime", get: (r) => r.generatedAt },
      t("Emailed to", (r) => r.emailedTo),
    ],
  },
  expenses: {
    title: "Expenses", permission: "expense.read", load: listExpenses,
    columns: [
      d("Date", (r) => r.date), t("Employee", (r) => r.employee?.fullName), t("Project", (r) => r.project?.name), t("Company", (r) => r.project?.company.name),
      t("Type", (r) => label(EXPENSE_TYPE, r.type)), t("Description", (r) => r.description), m("Amount", (r) => r.amount),
      t("Status", (r) => label(EXPENSE_STATUS, r.status)), t("Approved by", (r) => r.approvedBy?.name), d("Paid date", (r) => r.paidDate),
    ],
  },
  documents: {
    title: "Documents", permission: "document.read", load: listDocuments,
    columns: [
      t("Title", (r) => r.title), t("Type", (r) => label(DOCUMENT_TYPE, r.type)),
      t("Belongs to", (r) => r.employee?.fullName ?? r.company?.name ?? r.project?.name), { header: "Uploaded", kind: "datetime", get: (r) => r.uploadedAt },
      d("Expiry", (r) => r.expiryDate), t("Verified", (r) => (r.verified ? "Yes" : "No")), t("File", (r) => r.fileName),
    ],
  },
  "audit-logs": {
    title: "Audit log", permission: "audit.read", load: listAuditLogs,
    columns: [
      { header: "When", kind: "datetime", get: (r) => r.createdAt }, t("User", (r) => r.userName), t("Action", (r) => r.action),
      t("Entity", (r) => r.entity), t("Entity ID", (r) => r.entityId), t("IP", (r) => r.ip),
      t("Old value", (r) => (r.oldValue ? JSON.stringify(r.oldValue) : "")), t("New value", (r) => (r.newValue ? JSON.stringify(r.newValue) : "")),
    ],
  },
  "report-revenue": {
    title: "Revenue report", permission: "report.read", load: revenueReport,
    columns: [
      t("Company", (r) => r.company), t("Project", (r) => r.project), mo("Month", (r) => r.month), { header: "Invoices", kind: "number", get: (r) => r.invoices },
      m("Invoice amount", (r) => r.invoiceAmount), m("Tax", (r) => r.tax), m("Total invoiced", (r) => r.total), m("Received", (r) => r.received), m("Outstanding", (r) => r.outstanding),
    ],
  },
  "report-payments": {
    title: "Payment report", permission: "report.read", load: listPayments,
    columns: [
      t("Company", (r) => r.company.name), t("Project", (r) => r.project?.name), d("Payment date", (r) => r.paymentDate), m("Amount", (r) => r.amountReceived),
      m("TDS", (r) => r.tdsDeducted), m("Bank credit", (r) => r.bankCredit), t("Reference", (r) => r.transactionRef ?? r.utr), t("Status", (r) => label(PAYMENT_STATUS, r.status)),
    ],
  },
  "report-payroll": {
    title: "Payroll report", permission: "report.read", load: payrollReport,
    columns: [
      mo("Month", (r) => r.month), t("Employee", (r) => r.employee), t("Employee ID", (r) => r.employeeCode), t("Project", (r) => r.project),
      m("Gross", (r) => r.gross), m("PF", (r) => r.pf), m("PT", (r) => r.pt), m("TDS", (r) => r.tds), m("Other deductions", (r) => r.otherDeductions),
      m("Total deductions", (r) => r.totalDeductions), m("Net salary", (r) => r.net), m("Bank credit", (r) => r.bankCredit),
    ],
  },
  "report-profitability": {
    title: "Project profitability", permission: ["report.read", "report.project"], mode: "any", load: profitabilityReport,
    columns: [
      t("Project", (r) => r.project), t("Company", (r) => r.company), t("Status", (r) => label(PROJECT_STATUS, r.status)),
      m("Expected revenue", (r) => r.expectedRevenue), m("Received revenue", (r) => r.receivedRevenue), m("Employee cost", (r) => r.employeeCost),
      m("Expenses", (r) => r.expenses), m("Expected margin", (r) => r.expectedMargin), { header: "Expected margin %", kind: "percent", get: (r) => r.expectedMarginPct },
      m("Actual margin", (r) => r.actualMargin), { header: "Actual margin %", kind: "percent", get: (r) => r.actualMarginPct },
    ],
  },
};

export const EXPORTABLE = Object.keys(SOURCES);

function display(v: unknown, kind: Kind = "text"): string {
  if (v == null || v === "") return "";
  switch (kind) {
    case "money": return round2(Number(v)).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    case "date": return formatDate(String(v));
    case "datetime": return formatDateTime(String(v));
    case "month": return monthLabel(String(v), "short");
    case "percent": return `${Number(v).toFixed(1)}%`;
    default: return String(v);
  }
}

export async function exportData(entity: string, format: "csv" | "xlsx" | "pdf", q: ListQuery, actor: Actor) {
  const src = SOURCES[entity];
  if (!src) throw badRequest("Unknown export.");
  requirePermission(actor, src.permission, src.mode);
  const result = await src.load({ ...q, page: 1, pageSize: 5000 }, actor);
  const rows = serialize(result.data) as unknown[];
  const stamp = new Date().toISOString().slice(0, 10);
  const filename = `ethelius-${entity}-${stamp}.${format}`;

  if (format === "csv") {
    const esc = (s: string) => (/[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
    const lines = [src.columns.map((c) => esc(c.header)).join(",")];
    for (const r of rows) lines.push(src.columns.map((c) => {
      const v = c.get(r);
      return esc(c.kind === "money" || c.kind === "number" ? (v == null ? "" : String(v)) : display(v, c.kind));
    }).join(","));
    return { filename, contentType: "text/csv; charset=utf-8", body: Buffer.from("﻿" + lines.join("\r\n"), "utf8") };
  }

  if (format === "xlsx") {
    const wb = new ExcelJS.Workbook();
    wb.creator = "Ethelius Admin";
    const ws = wb.addWorksheet(src.title.slice(0, 31), { views: [{ state: "frozen", ySplit: 1 }] });
    ws.columns = src.columns.map((c) => ({ header: c.header, key: c.header, width: Math.min(Math.max(c.header.length + 4, c.kind === "money" ? 16 : 14), 50) }));
    for (const r of rows) {
      ws.addRow(Object.fromEntries(src.columns.map((c) => {
        const v = c.get(r);
        if (v == null || v === "") return [c.header, null];
        if (c.kind === "money" || c.kind === "number" || c.kind === "percent") return [c.header, Number(v)];
        if (c.kind === "date") return [c.header, new Date(`${String(v).slice(0, 10)}T00:00:00Z`)];
        if (c.kind === "datetime") return [c.header, new Date(String(v))];
        return [c.header, display(v, c.kind)];
      })));
    }
    src.columns.forEach((c, i) => {
      const col = ws.getColumn(i + 1);
      if (c.kind === "money") col.numFmt = "#,##0.00";
      if (c.kind === "date") col.numFmt = "dd mmm yyyy";
      if (c.kind === "datetime") col.numFmt = "dd mmm yyyy hh:mm";
      if (c.kind === "percent") col.numFmt = '0.0"%"';
    });
    const header = ws.getRow(1);
    header.font = { bold: true, color: { argb: "FF0E1A16" } };
    header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFB8F3E5" } };
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: src.columns.length } };
    const buf = Buffer.from(await wb.xlsx.writeBuffer());
    return { filename, contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", body: buf };
  }

  const doc = new jsPDF({ orientation: src.columns.length > 6 ? "landscape" : "portrait", unit: "pt", format: "a4" });
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.text(src.title, 40, 44);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(102, 118, 111);
  doc.text(`ethelius · ${rows.length} rows · amounts in INR · generated ${formatDateTime(new Date())} by ${actor.userName}`, 40, 60);
  autoTable(doc, {
    startY: 74,
    head: [src.columns.map((c) => c.header)],
    body: rows.map((r) => src.columns.map((c) => display(c.get(r), c.kind))),
    styles: { font: "helvetica", fontSize: 7.5, cellPadding: 4, lineColor: [215, 228, 223], lineWidth: 0.5, textColor: [14, 26, 22] },
    headStyles: { fillColor: [184, 243, 229], textColor: [14, 26, 22], fontStyle: "bold" },
    alternateRowStyles: { fillColor: [247, 250, 249] },
    columnStyles: Object.fromEntries(src.columns.map((c, i) => [i, c.kind === "money" || c.kind === "number" || c.kind === "percent" ? { halign: "right" } : {}])),
    margin: { left: 40, right: 40 },
  });
  return { filename, contentType: "application/pdf", body: Buffer.from(doc.output("arraybuffer")) };
}

export const canExport = (entity: string, actor: Actor) => {
  const src = SOURCES[entity];
  return !!src && actorCan(actor, src.permission, src.mode);
};
