import "server-only";
import { prisma } from "@/lib/prisma";
import type { Permission } from "@/lib/permissions";
import type { NotificationType } from "@/generated/prisma/enums";

type NotifyInput = {
  type: NotificationType;
  title: string;
  body?: string;
  link?: string;
  /** Recipients: everyone holding this permission … */
  permission?: Permission;
  /** … and/or these users. */
  userIds?: string[];
  /** Same key for the same user is only ever stored once. */
  dedupeKey?: string;
  /** Leave the acting user out (they already know). */
  excludeUserId?: string;
};

export async function notify(input: NotifyInput) {
  const ids = new Set(input.userIds ?? []);
  if (input.permission) {
    const users = await prisma.user.findMany({
      where: { isActive: true, role: { permissions: { some: { permission: { key: input.permission } } } } },
      select: { id: true },
    });
    users.forEach((u) => ids.add(u.id));
  }
  if (input.excludeUserId) ids.delete(input.excludeUserId);
  if (!ids.size) return;

  await prisma.notification.createMany({
    data: [...ids].map((userId) => ({
      userId,
      type: input.type,
      title: input.title,
      body: input.body,
      link: input.link,
      dedupeKey: input.dedupeKey,
    })),
    skipDuplicates: true,
  });
}
