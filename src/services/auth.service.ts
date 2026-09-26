import "server-only";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { createSession, destroySession, getSession } from "@/lib/auth/session";
import { rateLimit } from "@/lib/auth/rate-limit";
import { audit } from "@/lib/audit";
import { tooMany, unauthorized, badRequest } from "@/lib/api/errors";
import type { Actor } from "@/lib/api/handler";

const MAX_FAILED = 5;
const LOCK_MINUTES = 15;
// Compared against when the email is unknown so response time does not reveal which accounts exist.
const DUMMY_HASH = "$2b$12$V6lpOHLa/8w1jT2eVOZZX.xfzxWFOkuxJuaBQn.QqEtQztd9X86u6";

export const hashPassword = (p: string) => bcrypt.hash(p, 12);

export async function login(input: { email: string; password: string; remember?: boolean }, ip: string | null, userAgent: string | null) {
  const byIp = rateLimit(`login:ip:${ip ?? "unknown"}`, 20, 15 * 60_000);
  const byEmail = rateLimit(`login:email:${input.email}`, 8, 15 * 60_000);
  if (!byIp.ok || !byEmail.ok) {
    throw tooMany(`Too many sign-in attempts. Try again in ${Math.ceil(Math.max(byIp.retryAfter, byEmail.retryAfter) / 60)} minutes.`);
  }

  const user = await prisma.user.findUnique({ where: { email: input.email } });
  const hash = user?.passwordHash ?? DUMMY_HASH;
  const valid = await bcrypt.compare(input.password, hash);

  if (user?.lockedUntil && user.lockedUntil > new Date()) {
    throw tooMany("This account is locked after repeated failed sign-ins. Try again in a few minutes.");
  }
  if (!user || !valid || !user.isActive) {
    if (user) {
      const failed = user.failedLogins + 1;
      await prisma.user.update({
        where: { id: user.id },
        data: {
          failedLogins: failed >= MAX_FAILED ? 0 : failed,
          lockedUntil: failed >= MAX_FAILED ? new Date(Date.now() + LOCK_MINUTES * 60_000) : null,
        },
      });
      await audit(
        { userId: user.id, userName: user.name, employeeId: null, permissions: new Set(), ip, userAgent },
        { action: "auth.login_failed", entity: "User", entityId: user.id },
      );
    }
    throw unauthorized("That email and password do not match an active account.");
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { failedLogins: 0, lockedUntil: null, lastLoginAt: new Date() },
  });
  await createSession(user.id, { remember: input.remember });
  await audit(
    { userId: user.id, userName: user.name, employeeId: user.employeeId, permissions: new Set(), ip, userAgent },
    { action: "auth.login", entity: "User", entityId: user.id },
  );
  return { ok: true };
}

export async function logout(actor: Actor | null) {
  await destroySession();
  if (actor) await audit(actor, { action: "auth.logout", entity: "User", entityId: actor.userId });
}

export async function changePassword(actor: Actor, currentPassword: string, newPassword: string) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: actor.userId } });
  if (!(await bcrypt.compare(currentPassword, user.passwordHash))) throw badRequest("Your current password is not correct.");
  const session = await getSession();
  await prisma.$transaction([
    prisma.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(newPassword) } }),
    // Sign out every other device.
    prisma.session.deleteMany({ where: { userId: user.id, NOT: { id: session?.id } } }),
  ]);
  await audit(actor, { action: "auth.password_changed", entity: "User", entityId: user.id });
}
