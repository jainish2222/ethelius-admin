/** Human labels for every enum the UI shows. Keys mirror the Prisma enums. */

export type Option<T extends string = string> = { value: T; label: string };

const opts = <T extends string>(map: Record<T, string>): Option<T>[] =>
  (Object.entries(map) as [T, string][]).map(([value, label]) => ({ value, label }));

export const EMPLOYMENT_TYPE = {
  PERMANENT: "Permanent", CONTRACT: "Contract", PROJECT: "Project", INTERN: "Intern",
  FREELANCER: "Freelancer", PART_TIME: "Part-time",
} as const;

export const EMPLOYEE_STATUS = {
  ACTIVE: "Active", ON_NOTICE: "On notice", RESIGNED: "Resigned", RELIEVED: "Relieved", INACTIVE: "Inactive",
} as const;

export const COMPANY_TYPE = {
  ENTERPRISE: "Enterprise", MID_MARKET: "Mid-market", STARTUP: "Startup", AGENCY: "Agency",
  GOVERNMENT: "Government", OTHER: "Other",
} as const;

export const COMPANY_STATUS = { ACTIVE: "Active", ON_HOLD: "On hold", INACTIVE: "Inactive" } as const;

export const PAYMENT_TERMS = {
  IMMEDIATE: "Immediate", NET_15: "Net 15", NET_30: "Net 30", NET_45: "Net 45", NET_60: "Net 60", CUSTOM: "Custom",
} as const;

export const BILLING_TYPE = {
  MONTHLY: "Monthly", HOURLY: "Hourly", FIXED: "Fixed project", MILESTONE: "Milestone", CUSTOM: "Custom",
} as const;

export const PROJECT_STATUS = {
  PLANNING: "Planning", ACTIVE: "Active", ON_HOLD: "On hold", COMPLETED: "Completed", CANCELLED: "Cancelled",
} as const;

export const ASSIGNMENT_STATUS = { PLANNED: "Planned", ACTIVE: "Active", ENDED: "Ended" } as const;

export const INVOICE_STATUS = {
  DRAFT: "Draft", SENT: "Sent", PARTIALLY_PAID: "Partially paid", PAID: "Paid", OVERDUE: "Overdue", CANCELLED: "Cancelled",
} as const;

export const PAYMENT_METHOD = {
  NEFT: "NEFT", RTGS: "RTGS", IMPS: "IMPS", WIRE: "Wire transfer", UPI: "UPI", CHEQUE: "Cheque", CASH: "Cash", OTHER: "Other",
} as const;

export const PAYMENT_STATUS = {
  PENDING: "Pending", RECEIVED: "Received", FAILED: "Failed", RECONCILED: "Reconciled",
} as const;

export const PAYROLL_STATUS = {
  DRAFT: "Draft", CALCULATED: "Calculated", APPROVED: "Approved", PROCESSING: "Processing", PAID: "Paid", CANCELLED: "Cancelled",
} as const;

export const SALARY_PAYMENT_STATUS = {
  PENDING: "Pending", PROCESSING: "Processing", PAID: "Paid", FAILED: "Failed", ON_HOLD: "On hold",
} as const;

export const DEDUCTION_CODE = {
  PF: "Provident fund", PT: "Professional tax", TDS: "Income tax (TDS)", ESI: "ESI", LOAN: "Loan / advance", OTHER: "Other",
} as const;

export const DEDUCTION_CALC = {
  FIXED: "Fixed amount", PERCENT_OF_BASIC: "% of basic", PERCENT_OF_GROSS: "% of gross", MANUAL: "Entered per payroll",
} as const;

export const EARNING_CODE = {
  BASIC: "Basic salary", HRA: "House rent allowance", SPECIAL: "Special allowance", OTHER: "Other allowances",
  BONUS: "Bonus", OVERTIME: "Overtime", ARREARS: "Arrears", REIMBURSEMENT: "Reimbursement", CUSTOM: "Other earning",
} as const;

export const EXPENSE_TYPE = {
  TRAVEL: "Travel", ACCOMMODATION: "Accommodation", MEALS: "Meals", SOFTWARE: "Software", HARDWARE: "Hardware",
  TRAINING: "Training", COMMUNICATION: "Communication", CLIENT_ENTERTAINMENT: "Client entertainment", OTHER: "Other",
} as const;

export const EXPENSE_STATUS = { PENDING: "Pending", APPROVED: "Approved", REJECTED: "Rejected", PAID: "Paid" } as const;

export const DOCUMENT_TYPE = {
  RESUME: "Resume", OFFER_LETTER: "Offer letter", EMPLOYMENT_AGREEMENT: "Employment agreement", ID_PROOF: "ID proof",
  PAN: "PAN", BANK_PROOF: "Bank proof", EXPERIENCE_LETTER: "Experience letter", RELIEVING_LETTER: "Relieving letter",
  CONTRACT: "Contract", PURCHASE_ORDER: "Purchase order", OTHER: "Other",
} as const;

/** Document types that hold identity or bank data — only visible with employee.pii. */
export const SENSITIVE_DOCUMENT_TYPES = ["ID_PROOF", "PAN", "BANK_PROOF"] as const;

export const DEPARTMENTS = [
  "Engineering", "Design", "Quality Assurance", "DevOps", "Data", "Product", "Delivery", "Human Resources", "Finance", "Sales", "Operations",
];

export const Options = {
  employmentType: opts(EMPLOYMENT_TYPE),
  employeeStatus: opts(EMPLOYEE_STATUS),
  companyType: opts(COMPANY_TYPE),
  companyStatus: opts(COMPANY_STATUS),
  paymentTerms: opts(PAYMENT_TERMS),
  billingType: opts(BILLING_TYPE),
  projectStatus: opts(PROJECT_STATUS),
  assignmentStatus: opts(ASSIGNMENT_STATUS),
  invoiceStatus: opts(INVOICE_STATUS),
  paymentMethod: opts(PAYMENT_METHOD),
  paymentStatus: opts(PAYMENT_STATUS),
  payrollStatus: opts(PAYROLL_STATUS),
  salaryPaymentStatus: opts(SALARY_PAYMENT_STATUS),
  deductionCode: opts(DEDUCTION_CODE),
  deductionCalc: opts(DEDUCTION_CALC),
  earningCode: opts(EARNING_CODE),
  expenseType: opts(EXPENSE_TYPE),
  expenseStatus: opts(EXPENSE_STATUS),
  documentType: opts(DOCUMENT_TYPE),
};

/** Every status label in one place, for StatusBadge. */
export const STATUS_LABELS: Record<string, string> = {
  ...EMPLOYEE_STATUS, ...COMPANY_STATUS, ...PROJECT_STATUS, ...ASSIGNMENT_STATUS, ...INVOICE_STATUS,
  ...PAYMENT_STATUS, ...PAYROLL_STATUS, ...SALARY_PAYMENT_STATUS, ...EXPENSE_STATUS,
  PARTIAL: "Partial", UNBILLED: "Not invoiced", VERIFIED: "Verified", UNVERIFIED: "Unverified",
};

export const label = (map: Record<string, string>, key?: string | null) => (key ? map[key] ?? key : "");
