import { z } from "zod";
import { currency, dateStr, decimal, id, money, monthStr, optDate, optId, optMonth, optText, reqText } from "./common";

export const invoiceItemSchema = z.object({
  description: reqText(300),
  quantity: decimal(0.01, 1e6).default(1),
  unitPrice: money(),
});

export const invoiceSchema = z
  .object({
    companyId: id,
    projectId: optId,
    billingMonth: optMonth,
    invoiceNumber: z.string().trim().max(40).optional(),
    invoiceDate: dateStr,
    dueDate: optDate,
    currency,
    exchangeRate: decimal(0.000001, 1e6).default(1),
    taxPercent: decimal(0, 50).default(0),
    discountAmount: money().default(0),
    paymentTerms: z.enum(["IMMEDIATE", "NET_15", "NET_30", "NET_45", "NET_60", "CUSTOM"]).optional(),
    status: z.enum(["DRAFT", "SENT"]).default("DRAFT"),
    notes: optText(2000),
    items: z.array(invoiceItemSchema).min(1, "Add at least one line"),
  })
  .refine((i) => !i.dueDate || i.dueDate >= i.invoiceDate, { path: ["dueDate"], message: "Due before it was issued" });
export type InvoiceInput = z.input<typeof invoiceSchema>;

export const generateInvoicesSchema = z.object({
  month: monthStr,
  projectIds: z.array(z.string()).optional(),
  send: z.boolean().default(false),
});

export const invoiceStatusSchema = z.object({ action: z.enum(["send", "cancel", "reopen"]) });

export const paymentSchema = z
  .object({
    companyId: id,
    projectId: optId,
    invoiceId: optId,
    paymentDate: dateStr,
    amountReceived: money("Enter the amount settled"),
    tdsDeducted: money().default(0),
    otherDeduction: money().default(0),
    currency,
    exchangeRate: decimal(0.000001, 1e6).default(1),
    method: z.enum(["NEFT", "RTGS", "IMPS", "WIRE", "UPI", "CHEQUE", "CASH", "OTHER"]),
    bankAccount: optText(80),
    transactionRef: optText(80),
    utr: optText(40),
    status: z.enum(["PENDING", "RECEIVED", "FAILED", "RECONCILED"]),
    notes: optText(1000),
  })
  .refine((p) => p.tdsDeducted + p.otherDeduction <= p.amountReceived, {
    path: ["tdsDeducted"],
    message: "Deductions cannot exceed the amount settled",
  });
export type PaymentInput = z.input<typeof paymentSchema>;

export const attendanceSchema = z
  .object({
    employeeId: id,
    month: monthStr,
    workingDays: decimal(0, 31),
    presentDays: decimal(0, 31),
    paidLeave: decimal(0, 31).default(0),
    unpaidLeave: decimal(0, 31).default(0),
    lopDays: decimal(0, 31).default(0),
    holidays: decimal(0, 31).default(0),
    overtimeHours: decimal(0, 400).default(0),
    leaveBalance: decimal(0, 365).optional(),
    notes: optText(500),
  })
  .refine((a) => a.lopDays <= a.workingDays, { path: ["lopDays"], message: "More than the working days" })
  .refine((a) => a.presentDays + a.paidLeave <= a.workingDays + 0.001, {
    path: ["presentDays"],
    message: "Present days plus paid leave exceed working days",
  });
export type AttendanceInput = z.input<typeof attendanceSchema>;

export const payrollGenerateSchema = z.object({
  month: monthStr,
  employeeIds: z.array(z.string()).optional(),
  calculate: z.boolean().default(true),
});

const lineSchema = z.object({
  code: z.string(),
  label: reqText(80),
  amount: money(),
});

export const payrollEditSchema = z.object({
  earnings: z.array(lineSchema.extend({ code: z.enum(["BASIC", "HRA", "SPECIAL", "OTHER", "BONUS", "OVERTIME", "ARREARS", "REIMBURSEMENT", "CUSTOM"]) })),
  deductions: z.array(lineSchema.extend({ code: z.enum(["PF", "PT", "TDS", "ESI", "LOAN", "OTHER"]) })),
  notes: optText(1000),
});
export type PayrollEditInput = z.input<typeof payrollEditSchema>;

export const payrollActionSchema = z.object({
  action: z.enum(["calculate", "approve", "cancel", "reopen"]),
});

export const payrollBulkSchema = z.object({
  month: monthStr,
  action: z.enum(["calculate", "approve"]),
  ids: z.array(z.string()).optional(),
});

export const bankCreditSchema = z.object({
  actualBankCredit: money("Enter the amount credited"),
  bankCreditDate: dateStr,
  bankAccountId: optId,
  transactionRef: optText(80),
  paymentMode: optText(40),
  paymentStatus: z.enum(["PENDING", "PROCESSING", "PAID", "FAILED", "ON_HOLD"]),
  notes: optText(500),
});
export type BankCreditInput = z.input<typeof bankCreditSchema>;

export const payslipGenerateSchema = z.object({
  payrollIds: z.array(z.string()).min(1),
  regenerate: z.boolean().default(false),
});

export const payslipEmailSchema = z.object({ to: z.string().trim().email().optional() });
