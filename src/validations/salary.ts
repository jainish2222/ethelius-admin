import { z } from "zod";
import { dateStr, money, monthStr, optMonth, optText } from "./common";

export const salaryStructureSchema = z.object({
  annualCtc: money("Enter the annual CTC"),
  basic: money(),
  hra: money(),
  specialAllowance: money(),
  otherAllowances: money().default(0),
  bonus: money().default(0),
  employerPf: money().default(0),
  gratuity: money().default(0),
  effectiveFrom: dateStr,
  reason: optText(300),
  notes: optText(1000),
});
export type SalaryStructureInput = z.input<typeof salaryStructureSchema>;

export const recurringDeductionSchema = z.object({
  code: z.enum(["PF", "PT", "TDS", "ESI", "LOAN", "OTHER"]),
  label: z.string().trim().min(1).max(80),
  amount: money(),
  startMonth: monthStr,
  endMonth: optMonth,
  isActive: z.boolean().default(true),
  notes: optText(300),
});
export type RecurringDeductionInput = z.input<typeof recurringDeductionSchema>;

export const deductionRuleSchema = z.object({
  code: z.enum(["PF", "PT", "TDS", "ESI", "LOAN", "OTHER"]),
  name: z.string().trim().min(1).max(80),
  calcType: z.enum(["FIXED", "PERCENT_OF_BASIC", "PERCENT_OF_GROSS", "MANUAL"]),
  value: z.coerce.number().min(0).max(1e9),
  minGross: z.preprocess((v) => (v === "" || v == null ? null : Number(v)), z.number().min(0).nullable()),
  maxGross: z.preprocess((v) => (v === "" || v == null ? null : Number(v)), z.number().min(0).nullable()),
  capAmount: z.preprocess((v) => (v === "" || v == null ? null : Number(v)), z.number().min(0).nullable()),
  isActive: z.boolean().default(true),
  description: optText(300),
  sortOrder: z.coerce.number().int().default(0),
});
export type DeductionRuleInput = z.input<typeof deductionRuleSchema>;
