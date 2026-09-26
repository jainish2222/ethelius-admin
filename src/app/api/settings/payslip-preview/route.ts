import { api } from "@/lib/api/handler";
import { payslipTemplateSchema } from "@/validations/system";
import { renderPayslipHtml, type PayslipData } from "@/features/payslips/template";
import { currentMonth, todayDateOnly } from "@/lib/dates";
import { getBrandImages, getCompanyProfile } from "@/services/settings.service";
import { payslipFontCss } from "@/lib/payslip-font";

/** Renders sample data with an unsaved template so Settings can show changes live. */
export const POST = api({ permission: ["settings.manage", "payslip.write"], mode: "any" }, async ({ body }) => {
  const template = await body(payslipTemplateSchema);
  const [company, images] = await Promise.all([getCompanyProfile(), getBrandImages()]);
  const month = currentMonth();
  const earnings = [
    { label: "Basic salary", amount: 32000 },
    { label: "House rent allowance", amount: 12800 },
    { label: "Conveyance allowance", amount: 1600 },
    { label: "Special allowance", amount: 8400 },
    { label: "Performance bonus", amount: 5000 },
  ];
  const deductions = [
    { label: "Provident fund (employee)", amount: 1800 },
    { label: "Professional tax", amount: 200 },
    { label: "Income tax deducted at source", amount: 4200 },
  ];
  const gross = earnings.reduce((s, e) => s + e.amount, 0);
  const ded = deductions.reduce((s, d) => s + d.amount, 0);
  const data: PayslipData = {
    payslipNumber: `${template.numberPrefix}-${month.slice(0, 4)}-${month.slice(5)}-EMP0000`,
    issuedOn: todayDateOnly(),
    month,
    currency: "INR",
    company: { ...company, logo: images.logo || null },
    employee: {
      name: "Sample Employee", code: "EMP0000", designation: "Software Engineer", department: "Engineering",
      joiningDate: "2022-04-01", location: "Surat, Gujarat", pan: "ABCDE1234F", uan: "101234567890", pfNumber: "GJ/SRT/0012345/000/0000000",
    },
    attendance: { workingDays: 30, presentDays: 30, paidDays: 30, lopDays: 0, leaveBalance: 8 },
    earnings, deductions, gross, totalDeductions: ded, net: gross - ded,
    bank: { name: "Bank of Baroda", holder: "Sample Employee", account: "53480100018220", ifsc: "BARB0SARSUR", branch: "Sarthana, Surat" },
    payment: { mode: "Bank transfer (NEFT)", creditDate: todayDateOnly(), reference: "NEFT000000000", status: "PAID", actualCredit: gross - ded },
    signature: images.signature || null,
    template,
  };
  return new Response(renderPayslipHtml(data, { fontCss: await payslipFontCss() }), { headers: { "Content-Type": "text/html; charset=utf-8" } });
});
