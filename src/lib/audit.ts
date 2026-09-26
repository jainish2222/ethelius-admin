import "server-only";
import { prisma, type Tx } from "@/lib/prisma";
import { serialize } from "@/lib/serialize";
import type { Actor } from "@/lib/api/handler";

type AuditInput = {
  action: string;
  entity: string;
  entityId?: string | null;
  oldValue?: unknown;
  newValue?: unknown;
};

/** Fields that must never be written into the audit trail in clear text. */
const REDACT = new Set(["passwordHash", "password", "tokenHash", "accountNumber"]);

function clean(v: unknown): unknown {
  if (v == null) return undefined;
  const plain = serialize(v) as unknown;
  const strip = (x: unknown): unknown => {
    if (Array.isArray(x)) return x.map(strip);
    if (x && typeof x === "object") {
      const o: Record<string, unknown> = {};
      for (const [k, val] of Object.entries(x)) o[k] = REDACT.has(k) ? "[redacted]" : strip(val);
      return o;
    }
    return x;
  };
  return strip(plain);
}

/** Keeps only the keys that actually changed, so audit entries stay readable. */
export function diff(before: Record<string, unknown>, after: Record<string, unknown>) {
  const b = serialize(before) as Record<string, unknown>;
  const a = serialize(after) as Record<string, unknown>;
  const oldValue: Record<string, unknown> = {};
  const newValue: Record<string, unknown> = {};
  for (const k of Object.keys(a)) {
    if (k === "updatedAt") continue;
    if (JSON.stringify(b[k]) !== JSON.stringify(a[k])) {
      oldValue[k] = b[k];
      newValue[k] = a[k];
    }
  }
  return { oldValue, newValue, changed: Object.keys(newValue).length > 0 };
}

export async function audit(actor: Actor | null, input: AuditInput, tx: Tx | typeof prisma = prisma) {
  await tx.auditLog.create({
    data: {
      userId: actor?.userId ?? null,
      userName: actor?.userName ?? "System",
      action: input.action,
      entity: input.entity,
      entityId: input.entityId ?? null,
      oldValue: clean(input.oldValue) as object | undefined,
      newValue: clean(input.newValue) as object | undefined,
      ip: actor?.ip ?? null,
      userAgent: actor?.userAgent ?? null,
    },
  });
}
