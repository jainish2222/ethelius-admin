/**
 * Date helpers. Date-only values travel as "YYYY-MM-DD" strings and months as "YYYY-MM",
 * so nothing shifts across time zones between the browser, the server and Postgres DATE columns.
 */

export type Month = string; // "YYYY-MM"

const pad = (n: number) => String(n).padStart(2, "0");

export const toMonth = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
export const currentMonth = () => toMonth(new Date());
export const isMonth = (s: unknown): s is Month => typeof s === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(s);

export function addMonths(m: Month, delta: number): Month {
  const [y, mo] = m.split("-").map(Number);
  const d = new Date(Date.UTC(y, mo - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`;
}

/** Inclusive list of months from `from` to `to`. */
export function monthRange(from: Month, to: Month): Month[] {
  const out: Month[] = [];
  for (let m = from; m <= to; m = addMonths(m, 1)) out.push(m);
  return out;
}

export const daysInMonth = (m: Month) => {
  const [y, mo] = m.split("-").map(Number);
  return new Date(Date.UTC(y, mo, 0)).getUTCDate();
};

/** First and last day of a month as UTC-midnight Dates (how Prisma represents DATE columns). */
export function monthBounds(m: Month) {
  const [y, mo] = m.split("-").map(Number);
  return { start: new Date(Date.UTC(y, mo - 1, 1)), end: new Date(Date.UTC(y, mo, 0)) };
}

export function monthLabel(m?: Month | null, style: "long" | "short" = "long") {
  if (!m) return "";
  const [y, mo] = m.split("-").map(Number);
  return new Date(Date.UTC(y, mo - 1, 1)).toLocaleDateString("en-GB", {
    month: style, year: "numeric", timeZone: "UTC",
  });
}

export const monthShort = (m: Month) =>
  new Date(Date.UTC(+m.slice(0, 4), +m.slice(5, 7) - 1, 1)).toLocaleDateString("en-GB", { month: "short", timeZone: "UTC" });

/** Parses "YYYY-MM-DD" into a UTC-midnight Date for a Prisma DATE column. */
export function parseDateOnly(s: string): Date {
  const [y, m, d] = s.slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

/** Formats a DATE value (Date or ISO string) as "YYYY-MM-DD", reading its UTC parts. */
export function dateOnly(d?: Date | string | null): string {
  if (!d) return "";
  if (typeof d === "string") return d.slice(0, 10);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

export const todayDateOnly = () => {
  const n = new Date();
  return `${n.getFullYear()}-${pad(n.getMonth() + 1)}-${pad(n.getDate())}`;
};

/** 01 Sep 2026 */
export function formatDate(d?: Date | string | null) {
  if (!d) return "";
  const s = dateOnly(d);
  const [y, m, day] = s.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, day)).toLocaleDateString("en-GB", {
    day: "2-digit", month: "short", year: "numeric", timeZone: "UTC",
  });
}

/** 26 Sep 2026, 14:05 — for timestamps (local time). */
export function formatDateTime(d?: Date | string | null) {
  if (!d) return "";
  return new Date(d).toLocaleString("en-GB", {
    day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

export function relativeTime(d: Date | string) {
  const diff = (Date.now() - new Date(d).getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)}d ago`;
  return formatDate(d);
}

export function addDays(date: Date, days: number) {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

/** Whole-day difference b − a for DATE values. */
export const daysBetween = (a: Date, b: Date) => Math.round((b.getTime() - a.getTime()) / 86400000);

export const PAYMENT_TERM_DAYS: Record<string, number> = {
  IMMEDIATE: 0, NET_15: 15, NET_30: 30, NET_45: 45, NET_60: 60,
};
export const termDays = (terms: string, custom?: number | null) =>
  terms === "CUSTOM" ? (custom ?? 30) : (PAYMENT_TERM_DAYS[terms] ?? 30);
