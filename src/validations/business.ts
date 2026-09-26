import { z } from "zod";
import { currency, dateStr, id, money, optDate, optEmail, optId, optInt, optMoney, optText, reqText } from "./common";

const paymentTerms = z.enum(["IMMEDIATE", "NET_15", "NET_30", "NET_45", "NET_60", "CUSTOM"]);

export const companySchema = z.object({
  name: reqText(120),
  legalName: optText(200),
  type: z.enum(["ENTERPRISE", "MID_MARKET", "STARTUP", "AGENCY", "GOVERNMENT", "OTHER"]),
  billingContactName: optText(120),
  billingEmail: optEmail,
  phone: optText(30),
  address: optText(400),
  gstNumber: optText(15).refine((v) => !v || /^[0-9A-Z]{15}$/.test(v.toUpperCase()), "GSTIN is 15 characters"),
  pan: optText(10),
  paymentTerms,
  customPaymentDays: optInt,
  currency,
  contractStart: optDate,
  contractEnd: optDate,
  status: z.enum(["ACTIVE", "ON_HOLD", "INACTIVE"]),
  notes: optText(2000),
});
export type CompanyInput = z.input<typeof companySchema>;

export const companyContactSchema = z.object({
  name: reqText(120),
  email: optEmail,
  phone: optText(30),
  designation: optText(80),
  isPrimary: z.boolean().default(false),
});
export type CompanyContactInput = z.input<typeof companyContactSchema>;

export const projectSchema = z
  .object({
    name: reqText(120),
    code: reqText(20).regex(/^[A-Za-z0-9-]+$/, "Letters, numbers and dashes only"),
    companyId: id,
    managerId: optId,
    startDate: dateStr,
    endDate: optDate,
    billingType: z.enum(["MONTHLY", "HOURLY", "FIXED", "MILESTONE", "CUSTOM"]),
    monthlyBillingAmount: optMoney,
    hourlyRate: optMoney,
    taxPercent: z.coerce.number().min(0).max(50).default(18),
    currency,
    paymentTerms,
    customPaymentDays: optInt,
    status: z.enum(["PLANNING", "ACTIVE", "ON_HOLD", "COMPLETED", "CANCELLED"]),
    description: optText(2000),
  })
  .refine((p) => p.billingType !== "MONTHLY" || (p.monthlyBillingAmount ?? 0) > 0, {
    path: ["monthlyBillingAmount"],
    message: "Monthly projects need a monthly billing amount",
  })
  .refine((p) => !p.endDate || p.endDate >= p.startDate, { path: ["endDate"], message: "Ends before it starts" });
export type ProjectInput = z.input<typeof projectSchema>;

export const assignmentSchema = z
  .object({
    employeeId: id,
    projectId: id,
    role: reqText(80),
    startDate: dateStr,
    endDate: optDate,
    allocationPercent: z.coerce.number().int().min(1, "At least 1%").max(100, "At most 100%"),
    billingRate: optMoney,
    employeeCost: optMoney,
    status: z.enum(["PLANNED", "ACTIVE", "ENDED"]),
    notes: optText(1000),
  })
  .refine((a) => !a.endDate || a.endDate >= a.startDate, { path: ["endDate"], message: "Ends before it starts" });
export type AssignmentInput = z.input<typeof assignmentSchema>;

export const expenseSchema = z.object({
  employeeId: optId,
  projectId: optId,
  type: z.enum(["TRAVEL", "ACCOMMODATION", "MEALS", "SOFTWARE", "HARDWARE", "TRAINING", "COMMUNICATION", "CLIENT_ENTERTAINMENT", "OTHER"]),
  amount: money(),
  currency,
  date: dateStr,
  description: reqText(500),
});
export type ExpenseInput = z.input<typeof expenseSchema>;

export const expenseDecisionSchema = z.object({
  action: z.enum(["approve", "reject", "pay"]),
  reason: optText(300),
  paidDate: optDate,
});
