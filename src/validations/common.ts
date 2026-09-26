import { z } from "zod";

/** Optional text: trims, and turns "" into null so the database stores NULL, not empty strings. */
export const optText = (max = 500) =>
  z.string().trim().max(max).optional().nullable().transform((v) => (v ? v : null));

export const reqText = (max = 200, msg = "Required") => z.string().trim().min(1, msg).max(max);

export const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date");
export const optDate = z
  .union([dateStr, z.literal("")])
  .optional()
  .nullable()
  .transform((v) => (v ? v : null));

export const monthStr = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Pick a month");
export const optMonth = z
  .union([monthStr, z.literal("")])
  .optional()
  .nullable()
  .transform((v) => (v ? v : null));

/** Money from a form field: accepts "1,250.50" or 1250.5, rounds to paise. */
export const money = (msg = "Enter an amount") =>
  z.preprocess(
    (v) => (typeof v === "string" ? (v.trim() === "" ? undefined : Number(v.replace(/,/g, ""))) : v),
    z.number({ error: msg }).finite().min(0, "Cannot be negative").max(1e12),
  ).transform((n) => Math.round(n * 100) / 100);

export const optMoney = z.preprocess(
  (v) => (v === "" || v === null || v === undefined ? null : typeof v === "string" ? Number(v.replace(/,/g, "")) : v),
  z.number().finite().min(0, "Cannot be negative").max(1e12).nullable(),
).transform((n) => (n == null ? null : Math.round(n * 100) / 100));

export const decimal = (min = 0, max = 1e6) =>
  z.preprocess(
    (v) => (typeof v === "string" ? (v.trim() === "" ? 0 : Number(v)) : v ?? 0),
    z.number().finite().min(min).max(max),
  );

export const optInt = z.preprocess(
  (v) => (v === "" || v == null ? null : Number(v)),
  z.number().int().min(0).nullable(),
);

export const email = z.string().trim().toLowerCase().email("Enter a valid email");
export const optEmail = z
  .union([z.string().trim().toLowerCase().email("Enter a valid email"), z.literal("")])
  .optional()
  .nullable()
  .transform((v) => (v ? v : null));

export const currency = z.enum(["INR", "USD", "EUR", "GBP", "AED"]).default("INR");
export const id = z.string().min(1, "Required");
export const optId = z
  .string()
  .optional()
  .nullable()
  .transform((v) => (v ? v : null));
