import { z } from "zod";
import { api } from "@/lib/api/handler";
import { listNotifications, markRead } from "@/services/notification.service";

export const GET = api({}, async ({ actor, query }) => listNotifications(actor.userId, { unreadOnly: query.unread === "true" }));

export const POST = api({}, async ({ actor, body }) => {
  const { ids } = await body(z.object({ ids: z.union([z.array(z.string()).max(200), z.literal("all")]) }));
  await markRead(actor.userId, ids);
  return { ok: true };
});
