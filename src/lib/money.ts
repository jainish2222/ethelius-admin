/** Currency formatting and amount-in-words. Pure functions, safe on client and server. */

export const CURRENCIES = {
  INR: { symbol: "₹", locale: "en-IN", major: "Rupees", minor: "Paise", words: "indian" },
  USD: { symbol: "$", locale: "en-US", major: "Dollars", minor: "Cents", words: "intl" },
  EUR: { symbol: "€", locale: "en-IE", major: "Euros", minor: "Cents", words: "intl" },
  GBP: { symbol: "£", locale: "en-GB", major: "Pounds", minor: "Pence", words: "intl" },
  AED: { symbol: "AED ", locale: "en-AE", major: "Dirhams", minor: "Fils", words: "intl" },
} as const;

export type CurrencyCode = keyof typeof CURRENCIES;
export const CURRENCY_CODES = Object.keys(CURRENCIES) as CurrencyCode[];
export const BASE_CURRENCY: CurrencyCode = "INR";

const conf = (c?: string | null) => CURRENCIES[(c ?? "INR") as CurrencyCode] ?? CURRENCIES.INR;

export const round2 = (n: number | string | null | undefined) => Math.round((Number(n) || 0) * 100) / 100;
export const num = (n: unknown) => (n == null || n === "" ? 0 : Number(n) || 0);

/** ₹ 1,23,456.00 */
export function formatMoney(n: number | string | null | undefined, currency?: string | null, opts?: { decimals?: 0 | 2 }) {
  const c = conf(currency);
  const d = opts?.decimals ?? 2;
  return c.symbol + round2(n).toLocaleString(c.locale, { minimumFractionDigits: d, maximumFractionDigits: d });
}

/** ₹12.4L / ₹1.2Cr / $45.2K — for cards and chart axes. */
export function formatCompact(n: number | string | null | undefined, currency?: string | null) {
  const c = conf(currency);
  const v = Number(n) || 0;
  const abs = Math.abs(v);
  const sign = v < 0 ? "-" : "";
  const fmt = (x: number) => (x >= 100 ? x.toFixed(0) : x >= 10 ? x.toFixed(1) : x.toFixed(2)).replace(/\.0+$|(\.\d*[1-9])0+$/, "$1");
  if (c.words === "indian") {
    if (abs >= 1e7) return `${sign}${c.symbol}${fmt(abs / 1e7)}Cr`;
    if (abs >= 1e5) return `${sign}${c.symbol}${fmt(abs / 1e5)}L`;
    if (abs >= 1e3) return `${sign}${c.symbol}${fmt(abs / 1e3)}K`;
  } else {
    if (abs >= 1e9) return `${sign}${c.symbol}${fmt(abs / 1e9)}B`;
    if (abs >= 1e6) return `${sign}${c.symbol}${fmt(abs / 1e6)}M`;
    if (abs >= 1e3) return `${sign}${c.symbol}${fmt(abs / 1e3)}K`;
  }
  return `${sign}${c.symbol}${Math.round(abs)}`;
}

export const currencySymbol = (c?: string | null) => conf(c).symbol.trim();

// ── amount in words (ported from the payslip template) ──
const ONES = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve",
  "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
const under100 = (n: number) => (n < 20 ? ONES[n] : TENS[(n / 10) | 0] + (n % 10 ? " " + ONES[n % 10] : ""));
const under1000 = (n: number) => {
  const h = (n / 100) | 0;
  const r = n % 100;
  return (h ? ONES[h] + " Hundred" + (r ? " " : "") : "") + (r ? under100(r) : "");
};
function indianWords(n: number): string {
  if (!n) return "Zero";
  let out = "";
  const cr = Math.floor(n / 1e7); n %= 1e7;
  const lk = Math.floor(n / 1e5); n %= 1e5;
  const th = Math.floor(n / 1e3); n %= 1e3;
  if (cr) out += indianWords(cr) + " Crore ";
  if (lk) out += under100(lk) + " Lakh ";
  if (th) out += under100(th) + " Thousand ";
  if (n) out += under1000(n);
  return out.trim();
}
function intlWords(n: number): string {
  if (!n) return "Zero";
  let out = "";
  for (const [name, val] of [["Billion", 1e9], ["Million", 1e6], ["Thousand", 1e3]] as const) {
    const q = Math.floor(n / val);
    if (q) { out += under1000(q) + " " + name + " "; n %= val; }
  }
  if (n) out += under1000(n);
  return out.trim();
}

export function amountInWords(value: number, currency?: string | null) {
  const c = conf(currency);
  const neg = value < 0;
  const v = Math.abs(round2(value));
  const whole = Math.floor(v);
  const frac = Math.round((v - whole) * 100);
  const w = c.words === "indian" ? indianWords : intlWords;
  let s = c.major + " " + w(whole);
  if (frac) s += " and " + c.minor + " " + w(frac);
  return (neg ? "Minus " : "") + s + " only";
}

export function maskAccount(a?: string | null) {
  if (!a) return "";
  return a.length > 4 ? "•".repeat(Math.max(a.length - 4, 4)) + a.slice(-4) : a;
}
