import { z } from "zod";
import { email, optId, optText, reqText } from "./common";

export const loginSchema = z.object({
  email,
  password: z.string().min(1, "Enter your password").max(200),
  remember: z.boolean().optional(),
});

const password = z
  .string()
  .min(10, "At least 10 characters")
  .max(200)
  .refine((p) => /[A-Za-z]/.test(p) && /\d/.test(p), "Use letters and numbers");

export const userCreateSchema = z.object({
  name: reqText(120),
  email,
  role: z.enum(["SUPER_ADMIN", "HR_ADMIN", "FINANCE_ADMIN", "PROJECT_MANAGER", "EMPLOYEE"]),
  employeeId: optId,
  password,
  isActive: z.boolean().default(true),
});

export const userUpdateSchema = z.object({
  name: reqText(120),
  role: z.enum(["SUPER_ADMIN", "HR_ADMIN", "FINANCE_ADMIN", "PROJECT_MANAGER", "EMPLOYEE"]),
  employeeId: optId,
  isActive: z.boolean(),
  password: z.union([password, z.literal("")]).optional(),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: password,
});

export const rolePermissionsSchema = z.object({
  permissions: z.array(z.string()),
});

export const companyProfileSchema = z.object({
  name: reqText(80),
  legalName: optText(200),
  address: optText(300),
  email: optText(120),
  phone: optText(40),
  regNo: optText(120),
  website: optText(120),
});
export type CompanyProfile = z.output<typeof companyProfileSchema>;

export const payslipTemplateSchema = z.object({
  accent: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  mint: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  ink: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  showAttendance: z.boolean(),
  showStatutory: z.boolean(),
  showBank: z.boolean(),
  maskAccount: z.boolean(),
  showSignature: z.boolean(),
  signedBy: optText(120),
  footerNote: optText(300),
  numberPrefix: z.string().trim().min(1).max(10).regex(/^[A-Z0-9]+$/, "Capital letters and numbers"),
});
export type PayslipTemplate = z.output<typeof payslipTemplateSchema>;
