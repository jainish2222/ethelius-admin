/**
 * Payroll calculation — a pure function so it can be unit-tested and previewed.
 *
 *   paid factor   = paid days ÷ working days   (paid days = working days − LOP days)
 *   earnings      = fixed components × factor; bonus is not pro-rated; overtime at the hourly rate
 *   deductions    = active rules (PF, PT, ESI …) + the employee's recurring deductions (TDS, loan …)
 *                   + any manual lines; a manual line replaces the computed line with the same code
 *   net salary    = gross earnings − total deductions
 *
 * Lines are rounded to whole currency units, as payslips conventionally are.
 */

export type EarningCode = "BASIC" | "HRA" | "SPECIAL" | "OTHER" | "BONUS" | "OVERTIME" | "ARREARS" | "REIMBURSEMENT" | "CUSTOM";
export type DeductionCode = "PF" | "PT" | "TDS" | "ESI" | "LOAN" | "OTHER";

export type Line<C extends string> = { code: C; label: string; amount: number; ruleId?: string | null; isManual?: boolean };

export type CalcInput = {
  structure: {
    basic: number; hra: number; specialAllowance: number; otherAllowances: number;
    bonus: number; employerPf: number; gratuity: number;
  };
  attendance: { workingDays: number; paidDays: number; overtimeHours: number };
  rules: {
    id: string; code: DeductionCode; name: string;
    calcType: "FIXED" | "PERCENT_OF_BASIC" | "PERCENT_OF_GROSS" | "MANUAL";
    value: number; minGross: number | null; maxGross: number | null; capAmount: number | null; isActive: boolean;
  }[];
  recurring: { code: DeductionCode; label: string; amount: number }[];
  /** Lines the user added or overrode; kept across recalculation. */
  manualEarnings?: Line<EarningCode>[];
  manualDeductions?: Line<DeductionCode>[];
  /** Hours in a working day, for the overtime rate. */
  hoursPerDay?: number;
};

export type CalcResult = {
  factor: number;
  earnings: Line<EarningCode>[];
  deductions: Line<DeductionCode>[];
  gross: number;
  totalDeductions: number;
  net: number;
  employerCost: number;
};

export const COMPUTED_EARNINGS: EarningCode[] = ["BASIC", "HRA", "SPECIAL", "OTHER", "BONUS", "OVERTIME"];

const whole = (n: number) => Math.round(n);

export function calculatePayroll(input: CalcInput): CalcResult {
  const { structure: s, attendance: a } = input;
  const factor = a.workingDays > 0 ? Math.min(Math.max(a.paidDays / a.workingDays, 0), 1) : 0;

  const earnings: Line<EarningCode>[] = [];
  const push = (code: EarningCode, label: string, amount: number) => {
    const v = whole(amount);
    if (v > 0) earnings.push({ code, label, amount: v });
  };
  const basic = whole(s.basic * factor);
  push("BASIC", "Basic salary", basic);
  push("HRA", "House rent allowance", s.hra * factor);
  push("SPECIAL", "Special allowance", s.specialAllowance * factor);
  push("OTHER", "Other allowances", s.otherAllowances * factor);
  push("BONUS", "Bonus", s.bonus);
  if (a.overtimeHours > 0 && a.workingDays > 0) {
    const hourly = (s.basic + s.hra + s.specialAllowance + s.otherAllowances) / (a.workingDays * (input.hoursPerDay ?? 8));
    push("OVERTIME", `Overtime (${a.overtimeHours} h)`, hourly * a.overtimeHours);
  }
  for (const m of input.manualEarnings ?? []) if (m.amount > 0) earnings.push({ ...m, amount: whole(m.amount), isManual: true });

  const gross = earnings.reduce((t, e) => t + e.amount, 0);

  const manualCodes = new Set((input.manualDeductions ?? []).map((d) => d.code));
  const deductions: Line<DeductionCode>[] = [];
  for (const r of input.rules) {
    if (!r.isActive || r.calcType === "MANUAL" || manualCodes.has(r.code)) continue;
    if (r.minGross != null && gross < r.minGross) continue;
    if (r.maxGross != null && gross > r.maxGross) continue;
    let amt = r.calcType === "FIXED" ? r.value : r.calcType === "PERCENT_OF_BASIC" ? (basic * r.value) / 100 : (gross * r.value) / 100;
    if (r.capAmount != null) amt = Math.min(amt, r.capAmount);
    amt = r.calcType === "PERCENT_OF_GROSS" ? Math.ceil(amt) : whole(amt); // ESI rounds up
    if (amt > 0) deductions.push({ code: r.code, label: r.name, amount: amt, ruleId: r.id });
  }
  for (const rd of input.recurring) {
    if (manualCodes.has(rd.code) || rd.amount <= 0) continue;
    deductions.push({ code: rd.code, label: rd.label, amount: whole(rd.amount) });
  }
  for (const m of input.manualDeductions ?? []) if (m.amount > 0) deductions.push({ ...m, amount: whole(m.amount), isManual: true });

  const totalDeductions = deductions.reduce((t, d) => t + d.amount, 0);
  const employerCost = gross + whole(s.employerPf * factor) + whole(s.gratuity * factor);

  return { factor, earnings, deductions, gross, totalDeductions, net: gross - totalDeductions, employerCost };
}
