/**
 * Development seed — realistic, internally consistent demo data.
 * Everything is relative to today: six complete months of billing, receipts and paid payroll,
 * plus the current month in progress (invoices sent, payroll calculated and awaiting approval).
 *
 *   npx prisma db seed        (wipes the development database first)
 */
import "dotenv/config";
import bcrypt from "bcryptjs";
import { jsPDF } from "jspdf";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { databaseUrl, isRdsHost, pgPoolConfig } from "../src/lib/db-config";
import { putObject } from "../src/lib/object-store";
import { DEFAULT_ROLE_GRANTS, PERMISSIONS, ROLE_LABELS, type RoleKey } from "../src/lib/permissions";
import {
  addDays, addMonths, currentMonth, dateOnly, daysInMonth, monthBounds, monthLabel, monthRange, parseDateOnly, termDays, todayDateOnly, type Month,
} from "../src/lib/dates";
import { round2 } from "../src/lib/money";
import { calculatePayroll } from "../src/features/payroll/calc";
import type { PayslipData } from "../src/features/payslips/template";
import { DEFAULT_COMPANY_PROFILE, DEFAULT_PAYSLIP_TEMPLATE, SETTING_KEYS } from "../src/features/settings/defaults";

if (process.env.NODE_ENV === "production") throw new Error("Refusing to seed a production database.");
if (isRdsHost(databaseUrl()) && process.env.ALLOW_RDS_SEED !== "1") {
  throw new Error("Refusing to seed RDS — seeding wipes every table. Use `npm run db:bootstrap` there (or set ALLOW_RDS_SEED=1).");
}

const prisma = new PrismaClient({ adapter: new PrismaPg(pgPoolConfig()) });
const DEMO_PASSWORD = "Ethelius@2026";

// ── deterministic randomness ──
let seed = 20260926;
const rand = () => {
  seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const between = (a: number, b: number) => Math.floor(a + rand() * (b - a + 1));
const chance = (p: number) => rand() < p;

const TODAY = todayDateOnly();
const NOW_MONTH = currentMonth();
const HISTORY: Month[] = monthRange(addMonths(NOW_MONTH, -6), addMonths(NOW_MONTH, -1));
const d = (s: string) => parseDateOnly(s);
const monthStart = (m: Month) => dateOnly(monthBounds(m).start);
const monthEnd = (m: Month) => dateOnly(monthBounds(m).end);
const clampPast = (s: string) => (s < TODAY ? s : TODAY);

// ───────────────────────────── reference data ─────────────────────────────

const COMPANIES = [
  {
    key: "ARC", name: "Arcadia Healthcare", legalName: "Arcadia Healthcare Private Limited", type: "ENTERPRISE", paymentTerms: "NET_30", currency: "INR",
    gstNumber: "27AABCA4821K1Z3", pan: "AABCA4821K", billingContactName: "Rekha Menon", billingEmail: "accounts@arcadiahealth.example",
    phone: "+91 22 4000 1100", address: "Level 9, One BKC, Bandra Kurla Complex, Mumbai 400051", contractStart: "2024-04-01", contractEnd: "2027-03-31",
    contacts: [{ name: "Rekha Menon", designation: "Accounts Payable Lead", email: "accounts@arcadiahealth.example", isPrimary: true }, { name: "Dr. Anil Varma", designation: "CTO", email: "anil.varma@arcadiahealth.example" }],
  },
  {
    key: "BLP", name: "Bluepeak Logistics", legalName: "Bluepeak Logistics Limited", type: "ENTERPRISE", paymentTerms: "NET_45", currency: "INR",
    gstNumber: "24AACCB7310M1Z8", pan: "AACCB7310M", billingContactName: "Sanjay Gupta", billingEmail: "ap@bluepeak.example",
    phone: "+91 79 2650 4400", address: "Plot 14, GIFT City, Gandhinagar, Gujarat 382355", contractStart: "2024-10-01", contractEnd: "2027-09-30",
    contacts: [{ name: "Sanjay Gupta", designation: "Finance Controller", email: "ap@bluepeak.example", isPrimary: true }],
  },
  {
    key: "CRV", name: "Corvid Retail", legalName: "Corvid Retail Private Limited", type: "MID_MARKET", paymentTerms: "NET_30", currency: "INR",
    gstNumber: "29AADCC5561P1Z2", pan: "AADCC5561P", billingContactName: "Farah Qureshi", billingEmail: "payables@corvidretail.example",
    phone: "+91 80 4110 7788", address: "Prestige Tech Park, Outer Ring Road, Bengaluru 560103", contractStart: "2025-01-15", contractEnd: "2027-01-14",
    contacts: [{ name: "Farah Qureshi", designation: "Accounts Manager", email: "payables@corvidretail.example", isPrimary: true }, { name: "Vikram Sethi", designation: "Head of Digital", email: "vikram@corvidretail.example" }],
  },
  {
    key: "LUM", name: "Lumen Financial Services", legalName: "Lumen Financial Services Limited", type: "ENTERPRISE", paymentTerms: "NET_15", currency: "INR",
    gstNumber: "24AAECL2290Q1Z6", pan: "AAECL2290Q", billingContactName: "Hetal Shah", billingEmail: "vendor.payments@lumenfin.example",
    phone: "+91 261 400 2200", address: "Lumen House, Athwalines, Surat, Gujarat 395007", contractStart: "2025-10-20",
    contractEnd: dateOnly(addDays(d(TODAY), 22)), // renewal due — raises a contract-expiry alert
    contacts: [{ name: "Hetal Shah", designation: "Vendor Payments", email: "vendor.payments@lumenfin.example", isPrimary: true }],
  },
  {
    key: "NST", name: "Northstar Analytics", legalName: "Northstar Analytics Inc.", type: "STARTUP", paymentTerms: "NET_60", currency: "USD",
    gstNumber: null, pan: null, billingContactName: "Emily Carter", billingEmail: "finance@northstar-analytics.example",
    phone: "+1 408 555 0142", address: "181 Metro Drive, Suite 400, San Jose, CA 95110, USA", contractStart: "2025-02-01", contractEnd: "2027-01-31",
    contacts: [{ name: "Emily Carter", designation: "Controller", email: "finance@northstar-analytics.example", isPrimary: true }],
  },
] as const;

const USD_RATE = 83.45;

type ProjectSeed = {
  code: string; name: string; company: string; manager: string | null; start: string; end: string | null;
  billingType: "MONTHLY" | "HOURLY" | "FIXED" | "MILESTONE"; monthly: number | null; hourly?: number;
  status: "PLANNING" | "ACTIVE" | "ON_HOLD" | "COMPLETED"; description: string; billedUntil?: Month;
};

const PROJECTS: ProjectSeed[] = [
  { code: "ARC-EHR", name: "Patient Records Platform", company: "ARC", manager: "EMP002", start: "2024-04-01", end: null, billingType: "MONTHLY", monthly: 650000, status: "ACTIVE", description: "Electronic health record platform for Arcadia's 14 hospitals." },
  { code: "ARC-TEL", name: "Telehealth App", company: "ARC", manager: "EMP002", start: "2024-09-01", end: null, billingType: "MONTHLY", monthly: 420000, status: "ACTIVE", description: "Patient-facing video consultation app for iOS, Android and web." },
  { code: "ARC-LAB", name: "Lab Integrations", company: "ARC", manager: "EMP002", start: "2025-06-01", end: null, billingType: "MONTHLY", monthly: 280000, status: "ACTIVE", description: "HL7/FHIR integrations with partner diagnostic labs." },
  { code: "ARC-ANL", name: "Clinical Analytics", company: "ARC", manager: "EMP002", start: "2026-02-01", end: null, billingType: "FIXED", monthly: null, status: "ACTIVE", description: "Fixed-price analytics dashboards, billed on delivery." },
  { code: "BLP-FLT", name: "Fleet Tracking", company: "BLP", manager: "EMP013", start: "2024-10-01", end: null, billingType: "MONTHLY", monthly: 550000, status: "ACTIVE", description: "Real-time telematics and driver app for 2,000 trucks." },
  { code: "BLP-WMS", name: "Warehouse Management", company: "BLP", manager: "EMP013", start: "2025-03-01", end: null, billingType: "MONTHLY", monthly: 480000, status: "ACTIVE", description: "Inventory and pick-pack system for regional warehouses." },
  { code: "BLP-RTE", name: "Route Optimisation", company: "BLP", manager: "EMP013", start: "2026-01-12", end: null, billingType: "HOURLY", monthly: null, hourly: 2200, status: "ACTIVE", description: "Time-and-materials engagement on routing algorithms." },
  { code: "CRV-POS", name: "Point of Sale Revamp", company: "CRV", manager: "EMP013", start: "2025-01-15", end: null, billingType: "MONTHLY", monthly: 500000, status: "ACTIVE", description: "Cloud POS for 180 stores with offline sync." },
  { code: "CRV-LOY", name: "Loyalty Program", company: "CRV", manager: "EMP013", start: "2025-08-01", end: dateOnly(addDays(d(TODAY), 14)), billingType: "MONTHLY", monthly: 300000, status: "ACTIVE", description: "Points, tiers and partner rewards." },
  { code: "CRV-ECM", name: "E-commerce Storefront", company: "CRV", manager: "EMP013", start: "2025-05-01", end: null, billingType: "MONTHLY", monthly: 360000, status: "ON_HOLD", description: "Paused by the client pending a platform decision.", billedUntil: addMonths(NOW_MONTH, -4) },
  { code: "LUM-KYC", name: "Digital KYC", company: "LUM", manager: "EMP002", start: "2025-10-20", end: null, billingType: "MONTHLY", monthly: 450000, status: "ACTIVE", description: "Video KYC and document verification." },
  { code: "LUM-LND", name: "Lending Portal", company: "LUM", manager: "EMP002", start: "2026-01-05", end: null, billingType: "MONTHLY", monthly: 520000, status: "ACTIVE", description: "Loan origination portal and underwriting workflow." },
  { code: "LUM-RPT", name: "Regulatory Reporting", company: "LUM", manager: "EMP002", start: monthStart(addMonths(NOW_MONTH, 1)), end: null, billingType: "MONTHLY", monthly: 300000, status: "PLANNING", description: "RBI returns automation — kicks off next month." },
  { code: "NST-DPL", name: "Data Platform", company: "NST", manager: "EMP013", start: "2025-02-01", end: null, billingType: "MONTHLY", monthly: 9500, status: "ACTIVE", description: "Lakehouse and ingestion pipelines (billed in USD)." },
  { code: "NST-MLO", name: "ML Ops Tooling", company: "NST", manager: "EMP013", start: "2025-06-01", end: monthEnd(addMonths(NOW_MONTH, -2)), billingType: "MONTHLY", monthly: 7000, status: "COMPLETED", description: "Model registry and deployment tooling — delivered." },
];

type EmpSeed = {
  code: string; name: string; designation: string; department: string; type?: "PERMANENT" | "CONTRACT" | "INTERN";
  joined: string; salary: [string, number][]; manager?: string; location?: string; status?: "ACTIVE" | "ON_NOTICE"; exit?: string;
  assignments: { project: string; role: string; start: string; end?: string; pct: number; status?: "ACTIVE" | "ENDED" | "PLANNED" }[];
  tds?: number; bank: string;
};

const EMPLOYEES: EmpSeed[] = [
  { code: "EMP001", name: "Jainish Koladiya", designation: "Full Stack Developer", department: "Engineering", joined: "2021-08-02", manager: "EMP002",
    salary: [["2025-04-01", 720000], ["2026-01-01", 800000], ["2026-07-01", 1000000]], bank: "Bank of Baroda",
    assignments: [
      { project: "ARC-EHR", role: "Full Stack Developer", start: "2025-04-01", end: "2026-05-31", pct: 100, status: "ENDED" },
      { project: "LUM-LND", role: "Full Stack Developer", start: "2026-06-01", pct: 100 },
    ] },
  { code: "EMP002", name: "Aarav Mehta", designation: "Engineering Manager", department: "Delivery", joined: "2019-11-04", salary: [["2025-04-01", 2160000], ["2026-04-01", 2400000]], tds: 25000, bank: "HDFC Bank",
    assignments: [{ project: "ARC-EHR", role: "Delivery Lead", start: "2025-04-01", pct: 40 }, { project: "LUM-KYC", role: "Delivery Lead", start: "2025-10-20", pct: 30 }] },
  { code: "EMP003", name: "Priya Shah", designation: "HR Manager", department: "Human Resources", joined: "2020-02-10", salary: [["2025-04-01", 1400000]], tds: 5300, bank: "ICICI Bank", assignments: [] },
  { code: "EMP004", name: "Rohan Desai", designation: "Finance Manager", department: "Finance", joined: "2020-06-15", salary: [["2025-04-01", 1500000], ["2026-04-01", 1600000]], tds: 8300, bank: "Axis Bank", assignments: [] },
  { code: "EMP005", name: "Neha Patel", designation: "Senior Backend Engineer", department: "Engineering", joined: "2021-03-01", manager: "EMP002", salary: [["2025-04-01", 1620000], ["2026-04-01", 1800000]], tds: 11700, bank: "HDFC Bank",
    assignments: [{ project: "ARC-EHR", role: "Backend Lead", start: "2025-04-01", pct: 100 }] },
  { code: "EMP006", name: "Karan Joshi", designation: "Frontend Engineer", department: "Engineering", joined: "2022-07-18", manager: "EMP002", salary: [["2025-04-01", 900000], ["2026-04-01", 960000]], bank: "State Bank of India",
    assignments: [{ project: "ARC-TEL", role: "Frontend Engineer", start: "2025-04-01", pct: 100 }] },
  { code: "EMP007", name: "Ishita Rao", designation: "QA Engineer", department: "Quality Assurance", joined: "2022-01-10", manager: "EMP002", salary: [["2025-04-01", 780000]], bank: "Kotak Mahindra Bank",
    assignments: [{ project: "ARC-LAB", role: "QA Engineer", start: "2025-06-01", pct: 50 }, { project: "ARC-TEL", role: "QA Engineer", start: "2025-04-01", pct: 50 }] },
  { code: "EMP008", name: "Vivek Nair", designation: "DevOps Engineer", department: "DevOps", joined: "2021-09-20", manager: "EMP013", salary: [["2025-04-01", 1500000]], tds: 6800, bank: "HDFC Bank",
    assignments: [{ project: "BLP-FLT", role: "DevOps Engineer", start: "2025-04-01", pct: 60 }, { project: "BLP-WMS", role: "DevOps Engineer", start: "2025-04-01", pct: 40 }] },
  { code: "EMP009", name: "Sneha Iyer", designation: "Mobile Developer", department: "Engineering", joined: "2023-02-06", manager: "EMP013", salary: [["2025-04-01", 1000000], ["2026-04-01", 1080000]], bank: "ICICI Bank",
    assignments: [{ project: "BLP-FLT", role: "Mobile Developer", start: "2025-04-01", pct: 100 }] },
  { code: "EMP010", name: "Arjun Malhotra", designation: "Data Engineer", department: "Data", joined: "2022-05-02", manager: "EMP013", salary: [["2025-04-01", 1680000]], tds: 9500, bank: "Axis Bank",
    assignments: [{ project: "NST-DPL", role: "Data Engineer", start: "2025-04-01", pct: 100 }] },
  { code: "EMP011", name: "Diya Kapoor", designation: "UI/UX Designer", department: "Design", joined: "2023-06-12", manager: "EMP013", salary: [["2025-04-01", 840000]], bank: "Bank of Baroda",
    assignments: [{ project: "CRV-POS", role: "Product Designer", start: "2025-04-01", pct: 50 }, { project: "CRV-LOY", role: "Product Designer", start: "2025-08-01", pct: 50 }] },
  { code: "EMP012", name: "Harsh Trivedi", designation: "Backend Engineer", department: "Engineering", joined: "2023-09-04", manager: "EMP013", salary: [["2025-04-01", 840000]], bank: "State Bank of India",
    assignments: [
      { project: "CRV-ECM", role: "Backend Engineer", start: "2025-05-01", end: monthEnd(addMonths(NOW_MONTH, -4)), pct: 100, status: "ENDED" },
      { project: "CRV-POS", role: "Backend Engineer", start: monthStart(addMonths(NOW_MONTH, -3)), pct: 100 },
    ] },
  { code: "EMP013", name: "Meera Pillai", designation: "Project Manager", department: "Delivery", joined: "2020-10-05", salary: [["2025-04-01", 2000000]], tds: 15500, bank: "HDFC Bank",
    assignments: [{ project: "BLP-WMS", role: "Project Manager", start: "2025-04-01", pct: 40 }, { project: "CRV-POS", role: "Project Manager", start: "2025-04-01", pct: 30 }] },
  { code: "EMP014", name: "Aditya Kulkarni", designation: "Full Stack Developer", department: "Engineering", joined: "2024-01-08", manager: "EMP002", salary: [["2025-04-01", 720000]], bank: "Kotak Mahindra Bank",
    assignments: [{ project: "LUM-KYC", role: "Full Stack Developer", start: "2025-10-20", pct: 100 }] },
  { code: "EMP015", name: "Kavya Reddy", designation: "ML Engineer", department: "Data", joined: "2023-04-17", manager: "EMP013", salary: [["2025-04-01", 1440000]], tds: 5900, bank: "ICICI Bank",
    status: "ON_NOTICE", exit: dateOnly(addDays(d(TODAY), 25)),
    assignments: [
      { project: "NST-MLO", role: "ML Engineer", start: "2025-06-01", end: monthEnd(addMonths(NOW_MONTH, -2)), pct: 100, status: "ENDED" },
      { project: "NST-DPL", role: "ML Engineer", start: monthStart(addMonths(NOW_MONTH, -1)), pct: 50 },
    ] },
  { code: "EMP016", name: "Nikhil Bhatt", designation: "QA Automation Engineer", department: "Quality Assurance", joined: "2024-08-19", manager: "EMP002", salary: [["2025-04-01", 660000]], bank: "Bank of Baroda",
    assignments: [{ project: "LUM-LND", role: "QA Automation", start: "2026-01-05", pct: 100 }] },
  { code: "EMP017", name: "Riya Sen", designation: "Business Analyst", department: "Product", joined: "2023-11-13", manager: "EMP002", salary: [["2025-04-01", 900000]], bank: "Axis Bank",
    assignments: [{ project: "LUM-KYC", role: "Business Analyst", start: "2025-10-20", pct: 50 }, { project: "LUM-LND", role: "Business Analyst", start: "2026-01-05", pct: 50 }] },
  { code: "EMP018", name: "Siddharth Menon", designation: "Cloud Architect", department: "DevOps", type: "CONTRACT", joined: "2025-12-01", manager: "EMP013", salary: [["2025-12-01", 2160000]], tds: 18000, bank: "HDFC Bank",
    assignments: [{ project: "NST-DPL", role: "Cloud Architect", start: "2025-12-01", pct: 50 }, { project: "BLP-FLT", role: "Cloud Architect", start: "2025-12-01", pct: 50 }] },
  { code: "EMP019", name: "Tanvi Parekh", designation: "Software Engineering Intern", department: "Engineering", type: "INTERN", joined: monthStart(addMonths(NOW_MONTH, -3)), manager: "EMP013",
    salary: [[monthStart(addMonths(NOW_MONTH, -3)), 240000]], bank: "State Bank of India",
    assignments: [{ project: "CRV-LOY", role: "Engineering Intern", start: monthStart(addMonths(NOW_MONTH, -3)), pct: 100 }] },
  { code: "EMP020", name: "Yash Chauhan", designation: "Frontend Engineer", department: "Engineering", joined: monthStart(addMonths(NOW_MONTH, 1)), manager: "EMP002",
    salary: [[monthStart(addMonths(NOW_MONTH, 1)), 900000]], bank: "ICICI Bank",
    assignments: [{ project: "LUM-RPT", role: "Frontend Engineer", start: monthStart(addMonths(NOW_MONTH, 1)), pct: 100, status: "PLANNED" }] },
];

const IFSC: Record<string, string> = {
  "Bank of Baroda": "BARB0SARSUR", "HDFC Bank": "HDFC0001234", "ICICI Bank": "ICIC0000456", "Axis Bank": "UTIB0000789",
  "State Bank of India": "SBIN0001122", "Kotak Mahindra Bank": "KKBK0000654",
};

/** Salary split used across the company: basic 40% of monthly CTC, HRA half of basic. */
function components(annual: number) {
  const monthlyCtc = round2(annual / 12);
  const monthly = Math.round(annual / 12);
  const basic = Math.round(monthly * 0.4);
  const hra = Math.round(basic * 0.5);
  const otherAllowances = annual >= 300000 ? 1600 : 0;
  const employerPf = Math.min(Math.round(basic * 0.12), 1800);
  const gratuity = Math.round(basic * 0.0481);
  const specialAllowance = monthly - basic - hra - otherAllowances - employerPf - gratuity;
  return { annualCtc: annual, monthlyCtc, basic, hra, otherAllowances, employerPf, gratuity, specialAllowance, bonus: 0 };
}

async function pdfFile(rel: string, title: string, lines: string[]) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  doc.setFont("helvetica", "bold"); doc.setFontSize(18); doc.text(title, 56, 80);
  doc.setFont("helvetica", "normal"); doc.setFontSize(11);
  lines.forEach((l, i) => doc.text(l, 56, 120 + i * 20));
  doc.setFontSize(9); doc.setTextColor(120); doc.text("Demo document generated by the Ethelius seed script.", 56, 780);
  const buf = Buffer.from(doc.output("arraybuffer"));
  await putObject(rel, buf, "application/pdf");
  return buf.length;
}

async function wipe() {
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  if (tables.length) await prisma.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(", ")} RESTART IDENTITY CASCADE`);
}

async function main() {
  console.log("Seeding Ethelius demo data…");
  await wipe();

  // ── roles & permissions ──
  const perms = new Map<string, string>();
  for (const [key, v] of Object.entries(PERMISSIONS)) {
    const p = await prisma.permission.create({ data: { key, module: v.module, description: v.description } });
    perms.set(key, p.id);
  }
  const roles = new Map<RoleKey, string>();
  const ROLE_DESCRIPTIONS: Record<RoleKey, string> = {
    SUPER_ADMIN: "Everything, including users, roles and settings.",
    HR_ADMIN: "Employees, documents, assignments and attendance.",
    FINANCE_ADMIN: "Salary, payroll, billing, payments, payslips and reports.",
    PROJECT_MANAGER: "Projects, assignments and project reports.",
    EMPLOYEE: "Their own profile, payslips, documents and expenses.",
  };
  for (const key of Object.keys(ROLE_LABELS) as RoleKey[]) {
    const r = await prisma.role.create({
      data: {
        key, name: ROLE_LABELS[key], description: ROLE_DESCRIPTIONS[key],
        permissions: { create: DEFAULT_ROLE_GRANTS[key].map((p) => ({ permissionId: perms.get(p)! })) },
      },
    });
    roles.set(key, r.id);
  }

  // ── settings & deduction rules ──
  await prisma.setting.createMany({
    data: [
      { key: SETTING_KEYS.companyProfile, value: DEFAULT_COMPANY_PROFILE },
      { key: SETTING_KEYS.payslipTemplate, value: DEFAULT_PAYSLIP_TEMPLATE },
    ],
  });
  const rules = await Promise.all([
    prisma.deductionRule.create({ data: { code: "PF", name: "Provident fund (employee)", calcType: "PERCENT_OF_BASIC", value: 12, capAmount: 1800, sortOrder: 1, description: "12% of earned basic, capped at ₹1,800 (₹15,000 wage ceiling)." } }),
    prisma.deductionRule.create({ data: { code: "PT", name: "Professional tax", calcType: "FIXED", value: 200, minGross: 12000, sortOrder: 2, description: "Gujarat slab: ₹200 a month when gross is ₹12,000 or more." } }),
    prisma.deductionRule.create({ data: { code: "ESI", name: "ESI (employee)", calcType: "PERCENT_OF_GROSS", value: 0.75, maxGross: 21000, sortOrder: 3, description: "0.75% of gross for employees earning up to ₹21,000." } }),
    prisma.deductionRule.create({ data: { code: "TDS", name: "Income tax deducted at source", calcType: "MANUAL", value: 0, sortOrder: 4, description: "Set per employee as a recurring deduction from their tax projection." } }),
  ]);

  // ── employees ──
  const emp = new Map<string, { id: string; seed: EmpSeed; bankId: string; structures: { id: string; from: string; to: string | null; c: ReturnType<typeof components> }[] }>();
  for (const e of EMPLOYEES) {
    const [first, last] = e.name.toLowerCase().split(" ");
    const created = await prisma.employee.create({
      data: {
        employeeCode: e.code, fullName: e.name, designation: e.designation, department: e.department,
        employmentType: e.type ?? "PERMANENT", status: e.status ?? "ACTIVE", joiningDate: d(e.joined), exitDate: e.exit ? d(e.exit) : null,
        officialEmail: `${first}.${last}@ethelius.com`, personalEmail: `${first}${last}${between(10, 99)}@gmail.example`,
        phone: `+91 9${between(100000000, 999999999)}`, dateOfBirth: d(`${between(1988, 2003)}-${String(between(1, 12)).padStart(2, "0")}-${String(between(1, 28)).padStart(2, "0")}`),
        address: `${between(10, 420)}, ${["Vesu", "Adajan", "Piplod", "Athwa", "Pal", "Katargam"][between(0, 5)]}, Surat, Gujarat 3950${between(0, 9)}${between(1, 9)}`,
        emergencyContactName: `${["Rajesh", "Sunita", "Mahesh", "Kiran", "Anita"][between(0, 4)]} ${e.name.split(" ")[1]}`,
        emergencyContactPhone: `+91 9${between(100000000, 999999999)}`, emergencyRelation: ["Father", "Mother", "Spouse", "Sibling"][between(0, 3)],
        experienceYears: Math.max(0, Math.round((Date.parse(TODAY) - Date.parse(e.joined)) / (365.25 * 86400000) * 10) / 10 + (e.type === "INTERN" ? 0 : between(1, 4))),
        workLocation: e.location ?? "Surat, Gujarat", noticePeriodDays: e.type === "INTERN" ? 15 : e.type === "CONTRACT" ? 30 : 60,
        pan: `${"ABCDEFGHJK"[between(0, 9)]}${"PQRSTUVWXY"[between(0, 9)]}${"LMNOP"[between(0, 4)]}P${e.name[0]}${between(1000, 9999)}${"ABCDEFGHJK"[between(0, 9)]}`,
        uan: e.type === "CONTRACT" ? null : String(between(100000000000, 101999999999)),
        pfNumber: e.type === "CONTRACT" ? null : `GJ/SRT/0012345/000/${String(Number(e.code.slice(3)) + 100).padStart(7, "0")}`,
        esiNumber: e.salary[e.salary.length - 1][1] <= 252000 ? String(between(3100000000, 3199999999)) : null,
        notes: e.status === "ON_NOTICE" ? "Resigned to pursue a master's degree. Handover plan agreed with the delivery lead." : null,
      },
    });
    const bank = await prisma.employeeBankAccount.create({
      data: {
        employeeId: created.id, bankName: e.bank, accountHolder: e.name, ifsc: IFSC[e.bank],
        accountNumber: String(between(10000000000, 99999999999)) + String(between(100, 999)),
        branch: ["Sarthana, Surat", "Ghod Dod Road, Surat", "Vesu, Surat", "Adajan, Surat", "Ring Road, Surat"][between(0, 4)],
      },
    });
    emp.set(e.code, { id: created.id, seed: e, bankId: bank.id, structures: [] });
  }
  for (const e of EMPLOYEES) {
    if (e.manager) await prisma.employee.update({ where: { id: emp.get(e.code)!.id }, data: { reportingManagerId: emp.get(e.manager)!.id } });
  }

  // ── users ──
  const hash = await bcrypt.hash(DEMO_PASSWORD, 12);
  const users = {
    admin: await prisma.user.create({ data: { email: "admin@ethelius.com", name: "Ethelius Admin", passwordHash: hash, roleId: roles.get("SUPER_ADMIN")! } }),
    hr: await prisma.user.create({ data: { email: "priya.shah@ethelius.com", name: "Priya Shah", passwordHash: hash, roleId: roles.get("HR_ADMIN")!, employeeId: emp.get("EMP003")!.id } }),
    finance: await prisma.user.create({ data: { email: "rohan.desai@ethelius.com", name: "Rohan Desai", passwordHash: hash, roleId: roles.get("FINANCE_ADMIN")!, employeeId: emp.get("EMP004")!.id } }),
    pm: await prisma.user.create({ data: { email: "meera.pillai@ethelius.com", name: "Meera Pillai", passwordHash: hash, roleId: roles.get("PROJECT_MANAGER")!, employeeId: emp.get("EMP013")!.id } }),
    employee: await prisma.user.create({ data: { email: "jainish.koladiya@ethelius.com", name: "Jainish Koladiya", passwordHash: hash, roleId: roles.get("EMPLOYEE")!, employeeId: emp.get("EMP001")!.id } }),
  };

  // ── salary structures & revisions (never overwritten: each revision closes the previous version) ──
  for (const [, info] of emp) {
    let prev: { id: string; annual: number } | null = null;
    info.seed.salary.forEach(([from], i, arr) => {
      const next = arr[i + 1];
      info.structures.push({ id: "", from, to: next ? dateOnly(addDays(d(next[0]), -1)) : null, c: components(arr[i][1]) });
    });
    for (const s of info.structures) {
      const created = await prisma.salaryStructure.create({
        data: { employeeId: info.id, ...s.c, effectiveFrom: d(s.from), effectiveTo: s.to ? d(s.to) : null, createdById: users.finance.id },
      });
      s.id = created.id;
      await prisma.salaryRevision.create({
        data: {
          employeeId: info.id, fromStructureId: prev?.id ?? null, toStructureId: created.id,
          previousCtc: prev?.annual ?? null, newCtc: s.c.annualCtc,
          changePercent: prev ? round2(((s.c.annualCtc - prev.annual) / prev.annual) * 100) : null,
          reason: prev ? (s.from.endsWith("-04-01") ? "Annual appraisal" : "Mid-year revision") : "Initial salary", effectiveFrom: d(s.from), revisedById: users.finance.id,
          createdAt: new Date(`${s.from}T10:00:00Z`),
        },
      });
      prev = { id: created.id, annual: s.c.annualCtc };
    }
    if (info.seed.tds) {
      await prisma.recurringDeduction.create({ data: { employeeId: info.id, code: "TDS", label: "Income tax deducted at source", amount: info.seed.tds, startMonth: "2025-04" } });
    }
  }
  await prisma.recurringDeduction.create({
    data: { employeeId: emp.get("EMP006")!.id, code: "LOAN", label: "Salary advance recovery", amount: 4000, startMonth: addMonths(NOW_MONTH, -3), endMonth: NOW_MONTH, notes: "₹16,000 advance recovered over four months." },
  });

  // ── companies, projects, assignments ──
  const companies = new Map<string, { id: string; seed: (typeof COMPANIES)[number] }>();
  for (const c of COMPANIES) {
    const { key, contacts, contractStart, contractEnd, ...data } = c;
    const created = await prisma.company.create({
      data: {
        ...data, type: data.type as never, paymentTerms: data.paymentTerms as never,
        contractStart: d(contractStart), contractEnd: d(contractEnd),
        notes: key === "NST" ? "Invoices in USD; services exported under LUT so no GST is charged." : null,
        contacts: { create: contacts.map((ct) => ({ ...ct })) },
        createdAt: new Date(`${contractStart}T09:00:00Z`),
      },
    });
    companies.set(key, { id: created.id, seed: c });
  }
  const projects = new Map<string, { id: string; seed: ProjectSeed; companyId: string; currency: string; terms: string; tax: number }>();
  for (const p of PROJECTS) {
    const company = companies.get(p.company)!;
    const currency = company.seed.currency;
    const created = await prisma.project.create({
      data: {
        name: p.name, code: p.code, companyId: company.id, managerId: p.manager ? emp.get(p.manager)!.id : null,
        startDate: d(p.start), endDate: p.end ? d(p.end) : null, billingType: p.billingType,
        monthlyBillingAmount: p.monthly, hourlyRate: p.hourly ?? null, taxPercent: currency === "INR" ? 18 : 0,
        currency, paymentTerms: company.seed.paymentTerms as never, status: p.status, description: p.description,
        createdAt: new Date(`${p.start}T09:00:00Z`),
      },
    });
    projects.set(p.code, { id: created.id, seed: p, companyId: company.id, currency, terms: company.seed.paymentTerms, tax: currency === "INR" ? 18 : 0 });
  }
  for (const [, info] of emp) {
    const annual = info.seed.salary[info.seed.salary.length - 1][1];
    for (const a of info.seed.assignments) {
      const p = projects.get(a.project)!;
      const monthlyCost = Math.round((annual / 12) * 1.08);
      await prisma.projectAssignment.create({
        data: {
          employeeId: info.id, projectId: p.id, role: a.role, startDate: d(a.start), endDate: a.end ? d(a.end) : null,
          allocationPercent: a.pct, status: a.status ?? "ACTIVE",
          billingRate: p.seed.monthly && p.currency === "INR" ? Math.round((p.seed.monthly * a.pct) / 100 / 2.5) : null,
          employeeCost: Math.round((monthlyCost * a.pct) / 100),
          createdAt: new Date(`${a.start}T09:30:00Z`),
        },
      });
    }
  }

  // ── invoices ──
  let invoiceSeq = new Map<string, number>();
  const nextNumber = (date: string) => {
    const y = date.slice(0, 4);
    const n = (invoiceSeq.get(y) ?? 0) + 1;
    invoiceSeq.set(y, n);
    return `INV-${y}-${String(n).padStart(4, "0")}`;
  };
  type Inv = { id: string; number: string; project: string; company: string; month: Month; date: string; due: string; subtotal: number; tax: number; total: number; currency: string; rate: number };
  const invoiceRows: Inv[] = [];
  const toInvoice: { project: string; month: Month; date: string; status: "SENT" }[] = [];
  for (const m of [...HISTORY, NOW_MONTH]) {
    for (const p of PROJECTS) {
      if (p.billingType !== "MONTHLY" || !p.monthly) continue;
      if (p.start > monthEnd(m) || (p.end && p.end < monthStart(m))) continue;
      if (p.billedUntil && m > p.billedUntil) continue;
      const date = m === NOW_MONTH ? dateOnly(addDays(d(TODAY), -1)) : monthStart(addMonths(m, 1));
      toInvoice.push({ project: p.code, month: m, date, status: "SENT" });
    }
  }
  toInvoice.sort((a, b) => a.date.localeCompare(b.date) || a.project.localeCompare(b.project));
  invoiceSeq = new Map();
  for (const t of toInvoice) {
    const p = projects.get(t.project)!;
    const subtotal = p.seed.monthly!;
    const tax = round2((subtotal * p.tax) / 100);
    const total = round2(subtotal + tax);
    const due = dateOnly(addDays(d(t.date), termDays(p.terms)));
    const number = nextNumber(t.date);
    const rate = p.currency === "USD" ? USD_RATE : 1;
    const created = await prisma.invoice.create({
      data: {
        invoiceNumber: number, companyId: p.companyId, projectId: p.id, billingMonth: t.month,
        invoiceDate: d(t.date), dueDate: d(due), currency: p.currency, exchangeRate: rate,
        subtotal, taxPercent: p.tax, taxAmount: tax, discountAmount: 0, total,
        paymentTerms: p.terms as never, status: "SENT", sentAt: new Date(`${t.date}T10:00:00Z`), createdById: users.finance.id,
        createdAt: new Date(`${t.date}T09:00:00Z`),
        items: { create: [{ description: `Professional services — ${p.seed.name} — ${monthLabel(t.month)}`, quantity: 1, unitPrice: subtotal, amount: subtotal }] },
      },
    });
    invoiceRows.push({ id: created.id, number, project: t.project, company: p.seed.company, month: t.month, date: t.date, due, subtotal, tax, total, currency: p.currency, rate });
  }
  // A fixed-price milestone invoice and a time-and-materials invoice.
  {
    const p = projects.get("ARC-ANL")!;
    const date = monthStart(addMonths(NOW_MONTH, -2));
    const number = nextNumber(date);
    const subtotal = 900000, tax = 162000, total = 1062000, due = dateOnly(addDays(d(date), 30));
    const inv = await prisma.invoice.create({
      data: {
        invoiceNumber: number, companyId: p.companyId, projectId: p.id, billingMonth: addMonths(NOW_MONTH, -3), invoiceDate: d(date), dueDate: d(due),
        subtotal, taxPercent: 18, taxAmount: tax, total, paymentTerms: "NET_30", status: "SENT", sentAt: new Date(`${date}T10:00:00Z`), createdById: users.finance.id,
        items: { create: [{ description: "Milestone 1 — clinical dashboards delivered and accepted", quantity: 1, unitPrice: subtotal, amount: subtotal }] },
      },
    });
    invoiceRows.push({ id: inv.id, number, project: "ARC-ANL", company: "ARC", month: addMonths(NOW_MONTH, -3), date, due, subtotal, tax, total, currency: "INR", rate: 1 });
  }
  {
    const p = projects.get("BLP-RTE")!;
    const m = addMonths(NOW_MONTH, -1);
    const date = monthStart(NOW_MONTH);
    const number = nextNumber(date);
    const hours = 168, subtotal = hours * 2200, tax = round2(subtotal * 0.18), total = round2(subtotal + tax);
    const due = dateOnly(addDays(d(date), 45));
    const inv = await prisma.invoice.create({
      data: {
        invoiceNumber: number, companyId: p.companyId, projectId: p.id, billingMonth: m, invoiceDate: d(date), dueDate: d(due),
        subtotal, taxPercent: 18, taxAmount: tax, total, paymentTerms: "NET_45", status: "SENT", sentAt: new Date(`${date}T10:00:00Z`), createdById: users.finance.id,
        items: { create: [{ description: `Route optimisation engineering — ${monthLabel(m)}`, quantity: hours, unitPrice: 2200, amount: subtotal }] },
      },
    });
    invoiceRows.push({ id: inv.id, number, project: "BLP-RTE", company: "BLP", month: m, date, due, subtotal, tax, total, currency: "INR", rate: 1 });
  }
  // One draft for this month, not yet sent.
  {
    const p = projects.get("BLP-RTE")!;
    const number = nextNumber(TODAY);
    await prisma.invoice.create({
      data: {
        invoiceNumber: number, companyId: p.companyId, projectId: p.id, billingMonth: NOW_MONTH, invoiceDate: d(TODAY), dueDate: d(dateOnly(addDays(d(TODAY), 45))),
        subtotal: 290400, taxPercent: 18, taxAmount: 52272, total: 342672, paymentTerms: "NET_45", status: "DRAFT", createdById: users.finance.id,
        notes: "Hours to be confirmed with Bluepeak before sending.",
        items: { create: [{ description: `Route optimisation engineering — ${monthLabel(NOW_MONTH)} (to date)`, quantity: 132, unitPrice: 2200, amount: 290400 }] },
      },
    });
  }

  // ── client payments ──
  const paymentLog: { company: string; amount: number; bankCredit: number; date: string; invoice: string; currency: string; partial: boolean }[] = [];
  const BANK = "HDFC Bank current a/c ••••4412";
  for (const inv of invoiceRows) {
    const tdsRate = inv.currency === "INR" ? 0.1 : 0;
    const expectedPay = dateOnly(addDays(d(inv.due), between(-9, 6)));
    const pays: { date: string; amount: number; status: "RECEIVED" | "RECONCILED" | "PENDING" }[] = [];
    const lastHistory = HISTORY[HISTORY.length - 1];

    if (inv.project === "CRV-POS" && inv.month === addMonths(NOW_MONTH, -2)) {
      pays.push({ date: clampPast(dateOnly(addDays(d(inv.due), 3))), amount: 300000, status: "RECEIVED" }); // partial, rest overdue
    } else if (inv.project === "CRV-LOY" && inv.month === addMonths(NOW_MONTH, -4)) {
      pays.push({ date: dateOnly(addDays(d(inv.due), -2)), amount: 200000, status: "RECONCILED" });
      pays.push({ date: dateOnly(addDays(d(inv.due), 12)), amount: round2(inv.total - 200000), status: "RECONCILED" });
    } else if (inv.project === "BLP-FLT" && inv.month === lastHistory) {
      pays.push({ date: dateOnly(addDays(d(TODAY), -2)), amount: inv.total, status: "PENDING" }); // remittance advice, not yet credited
    } else if (inv.company === "LUM" && inv.month === lastHistory) {
      // Net 15 — past due and unpaid, so it shows as overdue.
    } else if (inv.project === "ARC-ANL") {
      pays.push({ date: clampPast(dateOnly(addDays(d(inv.due), -4))), amount: inv.total, status: "RECEIVED" });
    } else if (expectedPay < TODAY) {
      pays.push({ date: expectedPay, amount: inv.total, status: Date.parse(TODAY) - Date.parse(expectedPay) > 40 * 86400000 ? "RECONCILED" : "RECEIVED" });
    }

    let settled = 0;
    for (const p of pays) {
      const share = p.amount / inv.total;
      const tds = round2(inv.subtotal * tdsRate * share);
      const other = inv.currency === "USD" ? 25 : 0; // wire charges
      const bankCredit = round2(p.amount - tds - other);
      await prisma.payment.create({
        data: {
          companyId: companies.get(inv.company)!.id, projectId: projects.get(inv.project)!.id, invoiceId: inv.id,
          paymentDate: d(p.date), amountReceived: p.amount, tdsDeducted: tds, otherDeduction: other, bankCredit,
          currency: inv.currency, exchangeRate: inv.rate, method: inv.currency === "USD" ? "WIRE" : chance(0.3) ? "RTGS" : "NEFT",
          bankAccount: BANK, transactionRef: `${inv.company}${p.date.replace(/-/g, "")}${between(100, 999)}`,
          utr: inv.currency === "USD" ? `SWF${between(10000000, 99999999)}` : `HDFCR5${between(2026000000, 2026999999)}`,
          status: p.status, createdById: users.finance.id,
          notes: p.status === "PENDING" ? "Remittance advice received; awaiting bank credit." : tds ? "TDS under section 194J deducted by client." : null,
          createdAt: new Date(`${p.date}T11:20:00Z`),
        },
      });
      if (p.status !== "PENDING") {
        settled += p.amount;
        paymentLog.push({ company: companies.get(inv.company)!.seed.name, amount: p.amount, bankCredit, date: p.date, invoice: inv.number, currency: inv.currency, partial: settled < inv.total - 0.005 });
      }
    }
    const outstanding = inv.total - settled;
    const status = outstanding <= 0.005 ? "PAID" : inv.due < TODAY ? "OVERDUE" : settled > 0 ? "PARTIALLY_PAID" : "SENT";
    await prisma.invoice.update({ where: { id: inv.id }, data: { amountSettled: round2(settled), status } });
  }

  // ── attendance, payroll & payslips ──
  const ruleInput = rules.map((r) => ({
    id: r.id, code: r.code, name: r.name, calcType: r.calcType, value: Number(r.value), isActive: r.isActive,
    minGross: r.minGross == null ? null : Number(r.minGross), maxGross: r.maxGross == null ? null : Number(r.maxGross), capAmount: r.capAmount == null ? null : Number(r.capAmount),
  }));
  const recurringAll = await prisma.recurringDeduction.findMany();
  const leaveBalance = new Map<string, number>();
  let payslipCount = 0;

  for (const m of [...HISTORY, NOW_MONTH]) {
    const isCurrent = m === NOW_MONTH;
    const days = daysInMonth(m);
    for (const [code, info] of emp) {
      const e = info.seed;
      if (e.joined > monthEnd(m)) continue;
      if (e.exit && e.exit < monthStart(m)) continue;
      const structure = [...info.structures].reverse().find((s) => s.from <= monthEnd(m) && (!s.to || s.to >= monthStart(m)));
      if (!structure) continue;

      // Attendance
      const joinedMid = e.joined > monthStart(m);
      const activeDays = joinedMid ? daysInMonth(m) - Number(e.joined.slice(8)) + 1 : days;
      const lop = joinedMid ? days - activeDays : chance(0.12) ? (chance(0.7) ? 1 : 2) : 0;
      const paidLeave = chance(0.35) ? between(1, 2) : 0;
      const bal = (leaveBalance.get(code) ?? between(8, 14)) + 1.5 - paidLeave;
      leaveBalance.set(code, bal);
      await prisma.attendance.create({
        data: {
          employeeId: info.id, month: m, workingDays: days, presentDays: days - lop - paidLeave, paidLeave, unpaidLeave: joinedMid ? 0 : lop,
          lopDays: lop, holidays: 0, overtimeHours: code === "EMP008" && chance(0.5) ? between(6, 14) : 0, leaveBalance: Math.max(bal, 0),
          notes: joinedMid ? `Joined on ${e.joined}` : null,
        },
      });
      const att = await prisma.attendance.findUniqueOrThrow({ where: { employeeId_month: { employeeId: info.id, month: m } } });

      // Payroll
      const recurring = recurringAll.filter((r) => r.employeeId === info.id && r.startMonth <= m && (!r.endMonth || r.endMonth >= m));
      const calc = calculatePayroll({
        structure: { basic: structure.c.basic, hra: structure.c.hra, specialAllowance: structure.c.specialAllowance, otherAllowances: structure.c.otherAllowances, bonus: 0, employerPf: structure.c.employerPf, gratuity: structure.c.gratuity },
        attendance: { workingDays: days, paidDays: days - lop, overtimeHours: Number(att.overtimeHours) },
        rules: ruleInput as never,
        recurring: recurring.map((r) => ({ code: r.code, label: r.label, amount: Number(r.amount) })),
        manualEarnings: m === addMonths(NOW_MONTH, -3) && ["EMP005", "EMP008", "EMP010"].includes(code) ? [{ code: "BONUS", label: "Performance bonus", amount: 15000 }] : [],
      });
      const creditDate = monthEnd(m);
      const variance = code === "EMP009" && m === addMonths(NOW_MONTH, -2) ? -5000 : 0;
      const paid = !isCurrent;
      const payroll = await prisma.payroll.create({
        data: {
          employeeId: info.id, salaryStructureId: structure.id, month: m,
          status: paid ? "PAID" : "CALCULATED",
          workingDays: days, paidDays: days - lop, lopDays: lop, overtimeHours: Number(att.overtimeHours),
          grossEarnings: calc.gross, totalDeductions: calc.totalDeductions, netSalary: calc.net, employerCost: calc.employerCost,
          bankAccountId: info.bankId,
          actualBankCredit: paid ? calc.net + variance : null,
          bankCreditDate: paid ? d(creditDate) : null,
          transactionRef: paid ? `SAL${m.replace("-", "")}${code}` : null,
          paymentMode: paid ? "Bank transfer (NEFT)" : null,
          paymentStatus: paid ? "PAID" : "PENDING",
          calculatedAt: new Date(`${dateOnly(addDays(d(creditDate), -4))}T09:00:00Z`),
          approvedAt: paid ? new Date(`${dateOnly(addDays(d(creditDate), -2))}T15:00:00Z`) : null,
          approvedById: paid ? users.finance.id : null,
          paidAt: paid ? new Date(`${creditDate}T12:00:00Z`) : null,
          notes: variance ? "₹5,000 held back pending bank detail verification; released with the next cycle." : null,
          items: { create: calc.earnings.map((x, i) => ({ code: x.code, label: x.label, amount: x.amount, sortOrder: i })) },
          deductions: { create: calc.deductions.map((x, i) => ({ code: x.code, label: x.label, amount: x.amount, ruleId: x.ruleId ?? null, isManual: false, sortOrder: i })) },
        },
      });

      if (paid) {
        const number = `PAY-${m.slice(0, 4)}-${m.slice(5)}-${code}`;
        const bank = await prisma.employeeBankAccount.findUniqueOrThrow({ where: { id: info.bankId } });
        const emRow = await prisma.employee.findUniqueOrThrow({ where: { id: info.id } });
        const snapshot: PayslipData = {
          payslipNumber: number, issuedOn: dateOnly(addDays(d(creditDate), 1)), month: m, currency: "INR",
          company: { ...DEFAULT_COMPANY_PROFILE, logo: null },
          employee: {
            name: emRow.fullName, code, designation: emRow.designation, department: emRow.department, joiningDate: dateOnly(emRow.joiningDate),
            location: emRow.workLocation, pan: emRow.pan, uan: emRow.uan, pfNumber: emRow.pfNumber, esiNumber: emRow.esiNumber,
          },
          attendance: { workingDays: days, presentDays: days - lop - paidLeave, paidDays: days - lop, lopDays: lop, leaveBalance: Math.max(bal, 0) },
          earnings: calc.earnings.map((x) => ({ label: x.label, amount: x.amount })),
          deductions: calc.deductions.map((x) => ({ label: x.label, amount: x.amount })),
          gross: calc.gross, totalDeductions: calc.totalDeductions, net: calc.net,
          bank: { name: bank.bankName, holder: bank.accountHolder, account: bank.accountNumber, ifsc: bank.ifsc, branch: bank.branch },
          payment: { mode: "Bank transfer (NEFT)", creditDate, reference: `SAL${m.replace("-", "")}${code}`, status: "PAID", actualCredit: calc.net + variance },
          signature: null,
          template: DEFAULT_PAYSLIP_TEMPLATE,
        };
        await prisma.payslip.create({
          data: {
            payslipNumber: number, payrollId: payroll.id, employeeId: info.id, month: m, snapshot: snapshot as never,
            generatedAt: new Date(`${dateOnly(addDays(d(creditDate), 1))}T10:00:00Z`), generatedById: users.finance.id,
            emailedAt: m < lastHistoryMonth() ? new Date(`${dateOnly(addDays(d(creditDate), 1))}T10:05:00Z`) : null,
            emailedTo: m < lastHistoryMonth() ? emRow.officialEmail : null,
          },
        });
        payslipCount++;
      }
    }
  }

  // ── expenses ──
  const EXPENSES: [string, string | null, string, number, string, string][] = [
    ["EMP002", "ARC-EHR", "TRAVEL", 18450, "Flight Surat–Mumbai for Arcadia steering committee", "PAID"],
    ["EMP002", "ARC-EHR", "ACCOMMODATION", 9600, "Hotel, two nights, Mumbai", "PAID"],
    ["EMP005", "ARC-EHR", "SOFTWARE", 12400, "Postman Enterprise seats (annual, pro-rated)", "PAID"],
    ["EMP013", "BLP-FLT", "TRAVEL", 6200, "Site visit to Bluepeak Gandhinagar depot", "PAID"],
    ["EMP008", "BLP-FLT", "SOFTWARE", 21800, "Grafana Cloud — load test month", "APPROVED"],
    ["EMP009", "BLP-FLT", "HARDWARE", 34990, "Rugged Android test device", "PAID"],
    ["EMP011", "CRV-POS", "SOFTWARE", 8900, "Figma professional seat", "PAID"],
    ["EMP013", "CRV-POS", "CLIENT_ENTERTAINMENT", 7400, "Working dinner with Corvid store-ops team", "APPROVED"],
    ["EMP012", "CRV-POS", "TRAVEL", 11250, "Pilot store rollout, Bengaluru", "PENDING"],
    ["EMP010", "NST-DPL", "SOFTWARE", 41500, "Databricks sandbox overage", "PAID"],
    ["EMP018", "NST-DPL", "TRAINING", 29500, "AWS Solutions Architect Professional exam", "APPROVED"],
    ["EMP014", "LUM-KYC", "SOFTWARE", 5600, "Video SDK test credits", "PAID"],
    ["EMP017", "LUM-LND", "TRAVEL", 2400, "Local travel to Lumen HQ workshops", "PENDING"],
    ["EMP001", "LUM-LND", "COMMUNICATION", 1199, "Mobile data for on-call week", "PENDING"],
    ["EMP016", "LUM-LND", "SOFTWARE", 6800, "BrowserStack Automate (monthly)", "APPROVED"],
    ["EMP007", "ARC-LAB", "TRAINING", 4500, "ISTQB advanced module", "REJECTED"],
    ["EMP006", "ARC-TEL", "HARDWARE", 3200, "USB-C hub for device lab", "PAID"],
    ["EMP002", "LUM-KYC", "MEALS", 2850, "Team lunch after go-live", "PAID"],
    ["EMP015", "NST-MLO", "SOFTWARE", 15800, "GPU spot instances for final benchmark", "PAID"],
    ["EMP019", "CRV-LOY", "TRAINING", 2999, "React course for onboarding", "APPROVED"],
    ["EMP013", null, "TRAVEL", 5400, "Delivery offsite, Daman", "REJECTED"],
    ["EMP003", null, "OTHER", 12000, "Campus hiring drive, SVNIT", "PAID"],
  ];
  for (let i = 0; i < EXPENSES.length; i++) {
    const [code, pcode, type, amount, description, status] = EXPENSES[i];
    const date = dateOnly(addDays(d(TODAY), -Math.round((i * 150) / EXPENSES.length) - between(1, 5)));
    await prisma.expense.create({
      data: {
        employeeId: emp.get(code)!.id, projectId: pcode ? projects.get(pcode)!.id : null, type: type as never, amount, date: d(date),
        description, status: status as never, submittedById: users.admin.id,
        approvedById: status !== "PENDING" ? users.finance.id : null, approvedAt: status !== "PENDING" ? new Date(`${dateOnly(addDays(d(date), 2))}T10:00:00Z`) : null,
        rejectionReason: status === "REJECTED" ? "Not a billable project cost — please claim through the training budget." : null,
        paidDate: status === "PAID" ? d(dateOnly(addDays(d(date), 9))) : null,
        createdAt: new Date(`${date}T08:30:00Z`),
      },
    });
  }

  // ── documents (small generated PDFs) ──
  let docs = 0;
  for (const [code, info] of emp) {
    const n = Number(code.slice(3));
    if (n > 14) continue;
    const e = info.seed;
    const items: [string, string, string[], boolean][] = [
      ["RESUME", `${e.name} — Resume`, [`${e.designation}`, `${e.department}`, "Experience and skills summary"], true],
      ["OFFER_LETTER", "Offer letter", [`Dear ${e.name},`, `We are pleased to offer you the role of ${e.designation}.`, `Date of joining: ${e.joined}`], true],
    ];
    if (n <= 9) items.push(["PAN", "PAN card", [`Name: ${e.name}`, "Permanent Account Number (masked in demo)"], n <= 6]);
    if (n <= 5) items.push(["BANK_PROOF", "Cancelled cheque", [`Account holder: ${e.name}`, `Bank: ${e.bank}`], true]);
    if (n === 15) items.push(["RELIEVING_LETTER", "Resignation acceptance", [`${e.name}'s resignation accepted.`, `Last working day: ${e.exit}`], false]);
    for (const [type, title, lines, verified] of items) {
      const rel = `employee/${info.id}/documents/${type.toLowerCase()}-${code}.pdf`;
      const size = await pdfFile(rel, title, lines);
      await prisma.document.create({
        data: {
          employeeId: info.id, type: type as never, title, fileName: `${type.toLowerCase()}-${code}.pdf`, filePath: rel, mimeType: "application/pdf", size,
          verified, verifiedById: verified ? users.hr.id : null, verifiedAt: verified ? new Date() : null, uploadedById: users.hr.id,
          uploadedAt: new Date(`${e.joined}T10:00:00Z`),
        },
      });
      docs++;
    }
  }
  for (const [key, c] of companies) {
    const rel = `company/${c.id}/msa-${key.toLowerCase()}.pdf`;
    const size = await pdfFile(rel, `Master Services Agreement — ${c.seed.name}`, [`Between Ethelius Technologies Pvt Ltd and ${c.seed.legalName}`, `Term: ${c.seed.contractStart} to ${c.seed.contractEnd}`, `Payment terms: ${c.seed.paymentTerms.replace("_", " ")}`]);
    await prisma.document.create({
      data: {
        companyId: c.id, type: "CONTRACT", title: "Master Services Agreement", fileName: `msa-${key.toLowerCase()}.pdf`, filePath: rel, mimeType: "application/pdf", size,
        expiryDate: d(c.seed.contractEnd), verified: true, verifiedById: users.admin.id, verifiedAt: new Date(), uploadedById: users.admin.id,
        uploadedAt: new Date(`${c.seed.contractStart}T10:00:00Z`),
      },
    });
    docs++;
  }

  // ── audit trail (so the activity feeds tell the story) ──
  const log = (action: string, entity: string, entityId: string | null, user: { id: string; name: string }, at: string, newValue?: object) =>
    prisma.auditLog.create({ data: { action, entity, entityId, userId: user.id, userName: user.name, newValue: newValue as never, createdAt: new Date(at), ip: "10.0.4.21" } });
  for (const [, info] of emp) {
    if (info.seed.joined > TODAY) continue; // future joiner is logged below, when HR added them
    await log("employee.created", "Employee", info.id, users.hr, `${info.seed.joined}T09:00:00Z`, { fullName: info.seed.name, designation: info.seed.designation });
  }
  const jainish = emp.get("EMP001")!;
  await log("assignment.ended", "ProjectAssignment", null, users.pm, "2026-05-31T17:00:00Z", { employee: "Jainish Koladiya", project: "Patient Records Platform" });
  await log("assignment.created", "ProjectAssignment", jainish.id, users.pm, "2026-06-01T09:30:00Z", { employee: "Jainish Koladiya", project: "Lending Portal", allocationPercent: 100 });
  await log("salary.revised", "SalaryStructure", jainish.structures[2].id, users.finance, "2026-07-01T10:00:00Z", { employee: "EMP001", annualCtc: 1000000, reason: "Mid-year revision" });
  for (const m of HISTORY) {
    const monthEndIso = monthEnd(m);
    await log("invoice.generated_monthly", "Invoice", null, users.finance, `${monthStart(addMonths(m, 1))}T09:05:00Z`, { month: m, created: invoiceRows.filter((i) => i.month === m).length });
    await log("payroll.approved", "Payroll", null, users.finance, `${dateOnly(addDays(d(monthEndIso), -2))}T15:00:00Z`, { month: m, employees: [...emp.values()].filter((x) => x.seed.joined <= monthEndIso).length });
    await log("payroll.bank_credit_recorded", "Payroll", null, users.finance, `${monthEndIso}T12:10:00Z`, { month: m, paymentStatus: "PAID" });
    await log("payslip.generated", "Payslip", null, users.finance, `${dateOnly(addDays(d(monthEndIso), 1))}T10:00:00Z`, { month: m, count: [...emp.values()].filter((x) => x.seed.joined <= monthEndIso).length });
  }
  for (const p of paymentLog.slice(-25)) {
    await log("payment.recorded", "Payment", null, users.finance, `${p.date}T11:20:00Z`, { company: p.company, amountReceived: p.amount, bankCredit: p.bankCredit, invoice: p.invoice, currency: p.currency, partial: p.partial });
  }
  await log("invoice.created", "Invoice", null, users.finance, `${dateOnly(addDays(d(TODAY), -1))}T09:15:00Z`, { month: NOW_MONTH, created: invoiceRows.filter((i) => i.month === NOW_MONTH).length });
  await log("payroll.calculated", "Payroll", null, users.finance, `${TODAY}T08:40:00Z`, { month: NOW_MONTH });
  await log("employee.updated", "Employee", emp.get("EMP015")!.id, users.hr, `${dateOnly(addDays(d(TODAY), -5))}T12:00:00Z`, { status: "ON_NOTICE" });
  await log("employee.created", "Employee", emp.get("EMP020")!.id, users.hr, `${dateOnly(addDays(d(TODAY), -3))}T11:00:00Z`, { fullName: "Yash Chauhan", designation: "Frontend Engineer" });

  // ── notifications ──
  const recipients = [users.admin, users.finance];
  const overdue = await prisma.invoice.findMany({ where: { status: "OVERDUE" }, include: { company: true } });
  for (const u of recipients) {
    for (const inv of overdue) {
      await prisma.notification.create({
        data: {
          userId: u.id, type: "INVOICE_OVERDUE", title: `${inv.invoiceNumber} is overdue`,
          body: `${inv.company.name} · due ${dateOnly(inv.dueDate)}`, link: `/invoices/${inv.id}`, dedupeKey: `invoice-overdue:${inv.id}`,
          createdAt: new Date(`${dateOnly(addDays(inv.dueDate, 1))}T07:00:00Z`),
        },
      });
    }
    await prisma.notification.create({ data: { userId: u.id, type: "PAYROLL_PENDING_APPROVAL", title: `Payroll for ${monthLabel(NOW_MONTH)} is ready for approval`, body: "Calculated for all eligible employees.", link: `/payroll?month=${NOW_MONTH}`, createdAt: new Date(`${TODAY}T08:41:00Z`) } });
    for (const p of paymentLog.slice(-3)) {
      await prisma.notification.create({ data: { userId: u.id, type: p.partial ? "PARTIAL_PAYMENT" : "PAYMENT_RECEIVED", title: `${p.partial ? "Partial payment" : "Payment received"} from ${p.company}`, body: `${p.invoice} settled`, link: "/payments", readAt: new Date(), createdAt: new Date(`${p.date}T11:21:00Z`) } });
    }
  }
  for (const u of [users.admin, users.hr]) {
    await prisma.notification.create({ data: { userId: u.id, type: "EMPLOYEE_LEAVING", title: "Kavya Reddy is on notice", body: `Last day ${emp.get("EMP015")!.seed.exit}`, link: `/employees/${emp.get("EMP015")!.id}`, createdAt: new Date(`${dateOnly(addDays(d(TODAY), -5))}T12:01:00Z`) } });
    await prisma.notification.create({ data: { userId: u.id, type: "EMPLOYEE_JOINING", title: `Yash Chauhan joins ${monthStart(addMonths(NOW_MONTH, 1))}`, body: "Frontend Engineer · Engineering", link: `/employees/${emp.get("EMP020")!.id}`, dedupeKey: `joining:${emp.get("EMP020")!.id}` } });
  }
  for (const u of [users.admin, users.finance]) {
    await prisma.notification.create({ data: { userId: u.id, type: "CONTRACT_EXPIRING", title: `Lumen Financial Services contract ends ${companies.get("LUM")!.seed.contractEnd}`, body: "Renew or plan the wind-down.", link: `/companies/${companies.get("LUM")!.id}`, dedupeKey: `contract:${companies.get("LUM")!.id}:${companies.get("LUM")!.seed.contractEnd}` } });
  }
  for (const u of [users.admin, users.pm]) {
    await prisma.notification.create({ data: { userId: u.id, type: "PROJECT_ENDING", title: `Loyalty Program ends ${PROJECTS.find((p) => p.code === "CRV-LOY")!.end}`, body: "Corvid Retail · plan the team's next assignments", link: `/projects/${projects.get("CRV-LOY")!.id}`, dedupeKey: `project-end:${projects.get("CRV-LOY")!.id}:${PROJECTS.find((p) => p.code === "CRV-LOY")!.end}` } });
  }
  const lastSlip = await prisma.payslip.findFirst({ where: { employeeId: jainish.id }, orderBy: { month: "desc" } });
  if (lastSlip) await prisma.notification.create({ data: { userId: users.employee.id, type: "PAYSLIP_GENERATED", title: `Your payslip for ${monthLabel(lastSlip.month)} is ready`, body: lastSlip.payslipNumber, link: `/payslips/${lastSlip.id}` } });
  await prisma.setting.create({ data: { key: SETTING_KEYS.lastScheduledCheck, value: new Date().toISOString() } });

  console.log(`
  ✓ ${COMPANIES.length} companies, ${PROJECTS.length} projects, ${EMPLOYEES.length} employees
  ✓ ${invoiceRows.length + 1} invoices, ${await prisma.payment.count()} payments, ${await prisma.payroll.count()} payroll runs, ${payslipCount} payslips
  ✓ ${EXPENSES.length} expenses, ${docs} documents

  Sign in at http://localhost:3000 — password for every demo account: ${DEMO_PASSWORD}
    admin@ethelius.com            Super admin
    rohan.desai@ethelius.com      Finance admin
    priya.shah@ethelius.com       HR admin
    meera.pillai@ethelius.com     Project manager
    jainish.koladiya@ethelius.com Employee (self-service)
`);
}

function lastHistoryMonth() {
  return HISTORY[HISTORY.length - 1];
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
