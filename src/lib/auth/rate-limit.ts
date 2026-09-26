import "server-only";

/**
 * Fixed-window limiter held in process memory. It throttles bursts against the login
 * endpoint; the per-account lockout stored on the User row is what survives restarts
 * and spans multiple instances.
 */
type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

export function rateLimit(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || b.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, retryAfter: 0 };
  }
  b.count++;
  if (buckets.size > 10_000) {
    for (const [k, v] of buckets) if (v.resetAt <= now) buckets.delete(k);
  }
  return b.count > limit
    ? { ok: false, retryAfter: Math.ceil((b.resetAt - now) / 1000) }
    : { ok: true, retryAfter: 0 };
}
