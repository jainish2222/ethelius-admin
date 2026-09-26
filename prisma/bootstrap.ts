/**
 * Prepares an empty (freshly migrated) database for real use: roles and permissions, default settings and
 * deduction rules, plus one Super Admin login — no demo data. Safe to re-run; existing rows are left alone.
 *
 *   npm run db:bootstrap -- admin@ethelius.com "Your Name"
 *
 * The password is asked for interactively (or read from ADMIN_PASSWORD when stdin is not a terminal).
 */
import "dotenv/config";
import { createInterface } from "node:readline";
import bcrypt from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { pgPoolConfig } from "../src/lib/db-config";
import { DEFAULT_ROLE_GRANTS, PERMISSIONS, ROLE_LABELS, type RoleKey } from "../src/lib/permissions";
import { DEFAULT_COMPANY_PROFILE, DEFAULT_PAYSLIP_TEMPLATE, SETTING_KEYS } from "../src/features/settings/defaults";
import { userCreateSchema } from "../src/validations/system";

const prisma = new PrismaClient({ adapter: new PrismaPg(pgPoolConfig()) });

const ROLE_DESCRIPTIONS: Record<RoleKey, string> = {
  SUPER_ADMIN: "Everything, including users, roles and settings.",
  HR_ADMIN: "Employees, documents, assignments and attendance.",
  FINANCE_ADMIN: "Salary, payroll, billing, payments, payslips and reports.",
  PROJECT_MANAGER: "Projects, assignments and project reports.",
  EMPLOYEE: "Their own profile, payslips, documents and expenses.",
};

const DEDUCTION_RULES = [
  { code: "PF", name: "Provident fund (employee)", calcType: "PERCENT_OF_BASIC", value: 12, capAmount: 1800, sortOrder: 1, description: "12% of earned basic, capped at ₹1,800 (₹15,000 wage ceiling)." },
  { code: "PT", name: "Professional tax", calcType: "FIXED", value: 200, minGross: 12000, sortOrder: 2, description: "Gujarat slab: ₹200 a month when gross is ₹12,000 or more." },
  { code: "ESI", name: "ESI (employee)", calcType: "PERCENT_OF_GROSS", value: 0.75, maxGross: 21000, sortOrder: 3, description: "0.75% of gross for employees earning up to ₹21,000." },
  { code: "TDS", name: "Income tax deducted at source", calcType: "MANUAL", value: 0, sortOrder: 4, description: "Set per employee as a recurring deduction from their tax projection." },
] as const;

function askHidden(question: string): Promise<string> {
  if (!process.stdin.isTTY) return Promise.resolve(process.env.ADMIN_PASSWORD ?? "");
  const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  const write = (rl as unknown as { _writeToOutput: (s: string) => void })._writeToOutput.bind(rl);
  (rl as unknown as { _writeToOutput: (s: string) => void })._writeToOutput = (s) => write(s.startsWith(question) ? s : "");
  return new Promise((resolve) => rl.question(question, (answer) => { rl.close(); process.stdout.write("\n"); resolve(answer); }));
}

async function main() {
  const [email, ...nameParts] = process.argv.slice(2);
  const name = nameParts.join(" ").trim();
  if (!email || !name) throw new Error('Usage: npm run db:bootstrap -- <email> "<full name>"');

  // ── roles & permissions ──
  for (const [key, v] of Object.entries(PERMISSIONS)) {
    await prisma.permission.upsert({ where: { key }, update: {}, create: { key, module: v.module, description: v.description } });
  }
  const perms = new Map((await prisma.permission.findMany()).map((p) => [p.key, p.id]));
  for (const key of Object.keys(ROLE_LABELS) as RoleKey[]) {
    if (await prisma.role.findUnique({ where: { key } })) continue; // keep any grants edited in the app
    await prisma.role.create({
      data: {
        key, name: ROLE_LABELS[key], description: ROLE_DESCRIPTIONS[key],
        permissions: { create: DEFAULT_ROLE_GRANTS[key].map((p) => ({ permissionId: perms.get(p)! })) },
      },
    });
  }

  // ── settings & deduction rules ──
  await prisma.setting.createMany({
    data: [
      { key: SETTING_KEYS.companyProfile, value: DEFAULT_COMPANY_PROFILE },
      { key: SETTING_KEYS.payslipTemplate, value: DEFAULT_PAYSLIP_TEMPLATE },
    ],
    skipDuplicates: true,
  });
  for (const rule of DEDUCTION_RULES) {
    if (!(await prisma.deductionRule.findFirst({ where: { code: rule.code } }))) await prisma.deductionRule.create({ data: rule });
  }

  // ── first Super Admin ──
  const normalized = email.trim().toLowerCase();
  if (await prisma.user.findUnique({ where: { email: normalized } })) {
    console.log(`${normalized} already exists — roles, settings and deduction rules are in place.`);
    return;
  }
  const password = await askHidden(`Password for ${normalized}: `);
  const check = userCreateSchema.shape.password.safeParse(password);
  if (!check.success) throw new Error(check.error.issues[0].message);
  if ((await askHidden("Repeat password: ")) !== password && process.stdin.isTTY) throw new Error("Passwords don't match");

  const role = await prisma.role.findUniqueOrThrow({ where: { key: "SUPER_ADMIN" } });
  await prisma.user.create({ data: { email: normalized, name, passwordHash: await bcrypt.hash(password, 12), roleId: role.id } });
  console.log(`Created Super Admin ${normalized}. Sign in and fill in Settings → Company profile.`);
}

main()
  .catch((e) => { console.error(e instanceof Error ? e.message : e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
