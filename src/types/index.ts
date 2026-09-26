/** Client-side shapes of API responses (Decimals arrive as numbers, dates as strings). */

export type Ref = { id: string; name: string };

export type EmployeeRow = {
  id: string; employeeCode: string; fullName: string; hasPhoto: boolean; designation: string; department: string;
  employmentType: string; status: string; joiningDate: string; exitDate: string; officialEmail: string | null; phone: string | null;
  projects: { id: string; name: string; code: string; companyId: string; companyName: string; allocation: number }[];
  currentCtc: number | null;
};

export type SalaryStructure = {
  id: string; annualCtc: number; monthlyCtc: number; basic: number; hra: number; specialAllowance: number; otherAllowances: number;
  bonus: number; employerPf: number; gratuity: number; effectiveFrom: string; effectiveTo: string | null; notes: string | null;
};

export type BankAccount = { id: string; bankName: string; accountHolder: string; accountNumber: string; ifsc: string; branch: string | null; isPrimary: boolean };

export type AssignmentRow = {
  id: string; employeeId: string; projectId: string; role: string; startDate: string; endDate: string; allocationPercent: number;
  billingRate: number | null; employeeCost: number | null; status: string; notes: string | null; isCurrent?: boolean;
  employee?: { id: string; fullName: string; employeeCode: string; designation: string; hasPhoto?: boolean };
  project?: { id: string; name: string; code: string; status?: string; company: { id: string; name: string } };
};

export type EmployeeDetail = {
  id: string; employeeCode: string; fullName: string; hasPhoto: boolean; personalEmail: string | null; officialEmail: string | null; phone: string | null;
  dateOfBirth: string; address: string | null; emergencyContactName: string | null; emergencyContactPhone: string | null; emergencyRelation: string | null;
  designation: string; department: string; experienceYears: number | null; joiningDate: string; employmentType: string; status: string;
  workLocation: string | null; reportingManagerId: string | null; noticePeriodDays: number | null; exitDate: string; notes: string | null;
  pan: string | null; uan: string | null; pfNumber: string | null; esiNumber: string | null;
  reportingManager: { id: string; fullName: string; designation: string } | null;
  directReports: { id: string; fullName: string; designation: string }[];
  user: { id: string; email: string; isActive: boolean; role: { key: string; name: string } } | null;
  assignments: AssignmentRow[];
  bankAccounts: BankAccount[] | null;
  currentSalary: SalaryStructure | null;
  access: { pii: boolean; bank: boolean; salary: boolean; salaryWrite: boolean; write: boolean; self: boolean };
};

export type CompanyRow = {
  id: string; name: string; legalName: string | null; type: string; status: string; billingContactName: string | null; billingEmail: string | null;
  phone: string | null; paymentTerms: string; currency: string; contractStart: string; contractEnd: string; projectCount: number; employeeCount: number;
  invoiced: number | null; received: number | null; outstanding: number | null; overdue: number | null;
};

export type MonthHistory = { month: string; invoiced: number; received: number; outstanding: number; status: string; count: number };

export type ProjectRow = {
  id: string; name: string; code: string; status: string; company: Ref; manager: { id: string; fullName: string } | null;
  startDate: string; endDate: string; billingType: string; currency: string; paymentTerms: string; monthlyBillingAmount: number | null;
  headcount: number; invoiced: number | null; received: number | null; outstanding: number | null;
};

export type Profitability = {
  expectedRevenue: number; receivedRevenue: number; bankCredited: number; employeeCost: number; expenses: number;
  expectedMargin: number; actualMargin: number; expectedMarginPct: number | null; actualMarginPct: number | null;
  months?: { month: string; revenue: number; received: number; cost: number; expenses: number }[];
};

export type InvoiceRow = {
  id: string; invoiceNumber: string; company: Ref; project: { id: string; name: string; code: string } | null; billingMonth: string | null;
  invoiceDate: string; dueDate: string; currency: string; exchangeRate: number; subtotal: number; taxPercent: number; taxAmount: number;
  discountAmount: number; total: number; amountSettled: number; outstanding: number; status: string; paymentCount: number; notes: string | null;
};

export type PaymentRow = {
  id: string; company: Ref; project: { id: string; name: string; code?: string } | null;
  invoice: { id: string; invoiceNumber: string; billingMonth?: string | null; total?: number } | null;
  paymentDate: string; amountReceived: number; tdsDeducted: number; otherDeduction: number; bankCredit: number; currency: string; exchangeRate: number;
  method: string; bankAccount: string | null; transactionRef: string | null; utr: string | null; status: string; notes: string | null;
  companyId: string; projectId: string | null; invoiceId: string | null;
};

export type PayrollRow = {
  id: string; month: string; status: string; paymentStatus: string;
  employee: { id: string; fullName: string; employeeCode: string; designation: string; department: string };
  paidDays: number; workingDays: number; lopDays: number; grossEarnings: number; pf: number; pt: number; tds: number; esi: number;
  totalDeductions: number; netSalary: number; employerCost: number; actualBankCredit: number | null; variance: number | null;
  bankCreditDate: string; transactionRef: string | null; bankAccount: string | null; payslip: { id: string; payslipNumber: string } | null;
};

export type PayslipRow = {
  id: string; payslipNumber: string; month: string; generatedAt: string; emailedAt: string | null; emailedTo: string | null;
  employee: { id: string; fullName: string; employeeCode: string; designation: string; officialEmail: string | null };
  payroll: { id: string; netSalary: number; grossEarnings: number; paymentStatus: string; actualBankCredit: number | null; bankCreditDate: string };
  generatedBy: { name: string } | null;
};

export type ExpenseRow = {
  id: string; type: string; amount: number; currency: string; date: string; description: string; status: string; hasReceipt: boolean;
  rejectionReason: string | null; paidDate: string; employeeId: string | null; projectId: string | null;
  employee: { id: string; fullName: string; employeeCode: string } | null;
  project: { id: string; name: string; code: string; company: Ref } | null;
  approvedBy: { name: string } | null;
};

export type DocumentRow = {
  id: string; type: string; title: string; fileName: string; mimeType: string; size: number; expiryDate: string; verified: boolean;
  notes: string | null; uploadedAt: string;
  employee: { id: string; fullName: string; employeeCode: string } | null; company: Ref | null; project: Ref | null;
  uploadedBy: { name: string } | null; verifiedBy: { name: string } | null;
};
