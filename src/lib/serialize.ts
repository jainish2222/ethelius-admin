import { Decimal } from "@prisma/client/runtime/client";

/**
 * Converts Prisma results into plain JSON: Decimal → number, Date → ISO string.
 * Money is Decimal(14,2) in the database; as a JS number it stays exact to the paisa
 * far beyond any amount this app handles.
 */
export type Serialized<T> = T extends Decimal
  ? number
  : T extends Date
    ? string
    : T extends (infer U)[]
      ? Serialized<U>[]
      : T extends object
        ? { [K in keyof T]: Serialized<T[K]> }
        : T;

export function serialize<T>(value: T): Serialized<T> {
  return walk(value) as Serialized<T>;
}

function walk(v: unknown): unknown {
  if (v === null || v === undefined) return v;
  if (v instanceof Date) return v.toISOString();
  if (Decimal.isDecimal(v)) return (v as Decimal).toNumber();
  if (Array.isArray(v)) return v.map(walk);
  if (typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) out[k] = walk(val);
    return out;
  }
  return v;
}

export const dec = (v: unknown) => (v == null ? 0 : Decimal.isDecimal(v) ? (v as Decimal).toNumber() : Number(v) || 0);
