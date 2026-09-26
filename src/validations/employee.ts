import { z } from "zod";
import { dateStr, decimal, optDate, optEmail, optId, optInt, optText, reqText } from "./common";

export const employeeSchema = z.object({
  employeeCode: reqText(20).regex(/^[A-Za-z0-9-]+$/, "Letters, numbers and dashes only"),
  fullName: reqText(120),
  personalEmail: optEmail,
  officialEmail: optEmail,
  phone: optText(30),
  dateOfBirth: optDate,
  address: optText(400),
  emergencyContactName: optText(120),
  emergencyContactPhone: optText(30),
  emergencyRelation: optText(60),
  designation: reqText(120),
  department: reqText(80),
  experienceYears: decimal(0, 60).optional(),
  joiningDate: dateStr,
  employmentType: z.enum(["PERMANENT", "CONTRACT", "PROJECT", "INTERN", "FREELANCER", "PART_TIME"]),
  status: z.enum(["ACTIVE", "ON_NOTICE", "RESIGNED", "RELIEVED", "INACTIVE"]),
  workLocation: optText(120),
  reportingManagerId: optId,
  noticePeriodDays: optInt,
  exitDate: optDate,
  notes: optText(2000),
  pan: optText(10).refine((v) => !v || /^[A-Z]{5}[0-9]{4}[A-Z]$/.test(v.toUpperCase()), "PAN looks like ABCDE1234F"),
  uan: optText(12).refine((v) => !v || /^\d{12}$/.test(v), "UAN is 12 digits"),
  pfNumber: optText(40),
  esiNumber: optText(20),
});
export type EmployeeInput = z.input<typeof employeeSchema>;

export const bankAccountSchema = z.object({
  bankName: reqText(80),
  accountHolder: reqText(120),
  accountNumber: reqText(30).regex(/^[0-9]{6,20}$/, "6–20 digits"),
  ifsc: reqText(11).regex(/^[A-Za-z]{4}0[A-Za-z0-9]{6}$/, "IFSC looks like BARB0SARSUR"),
  branch: optText(120),
});
export type BankAccountInput = z.input<typeof bankAccountSchema>;
