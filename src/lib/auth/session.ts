import "server-only";
import { createHmac, randomBytes } from "node:crypto";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import type { Permission, RoleKey } from "@/lib/permissions";

export const SESSION_COOKIE = "eth_session";
const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours
const REMEMBER_TTL_MS = 14 * 24 * 60 * 60 * 1000; // 14 days
const TOUCH_INTERVAL_MS = 5 * 60 * 1000;

export type SessionUser = {
  id: string;
  name: string;
  email: string;
  role: RoleKey;
  roleName: string;
  employeeId: string | null;
  hasPhoto: boolean;
};

export type Session = {
  id: string;
  user: SessionUser;
  permissions: Permission[];
};

function secret() {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new Error("SESSION_SECRET must be set to at least 32 characters");
  return s;
}

/** Only the HMAC of the token is stored, so a leaked sessions table cannot be replayed. */
const hashToken = (token: string) => createHmac("sha256", secret()).update(token).digest("hex");

export async function createSession(userId: string, opts: { remember?: boolean } = {}) {
  const token = randomBytes(32).toString("base64url");
  const ttl = opts.remember ? REMEMBER_TTL_MS : SESSION_TTL_MS;
  const h = await headers();
  await prisma.session.create({
    data: {
      tokenHash: hashToken(token),
      userId,
      expiresAt: new Date(Date.now() + ttl),
      ip: clientIp(h),
      userAgent: h.get("user-agent")?.slice(0, 300) ?? null,
    },
  });
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: Math.floor(ttl / 1000),
  });
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await prisma.session.deleteMany({ where: { tokenHash: hashToken(token) } });
  jar.delete(SESSION_COOKIE);
}

/** The signed-in session for this request, or null. Memoised per request. */
export const getSession = cache(async (): Promise<Session | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const row = await prisma.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: {
      user: {
        include: {
          role: { include: { permissions: { include: { permission: true } } } },
          employee: { select: { photoPath: true } },
        },
      },
    },
  });
  if (!row) return null;
  if (row.expiresAt < new Date() || !row.user.isActive) {
    await prisma.session.delete({ where: { id: row.id } }).catch(() => {});
    return null;
  }

  if (Date.now() - row.lastSeenAt.getTime() > TOUCH_INTERVAL_MS) {
    await prisma.session.update({ where: { id: row.id }, data: { lastSeenAt: new Date() } }).catch(() => {});
  }

  const u = row.user;
  return {
    id: row.id,
    user: {
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role.key as RoleKey,
      roleName: u.role.name,
      employeeId: u.employeeId,
      hasPhoto: !!u.employee?.photoPath,
    },
    permissions: u.role.permissions.map((rp) => rp.permission.key as Permission),
  };
});

export function clientIp(h: Headers) {
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || null;
}
