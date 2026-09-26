import { api } from "@/lib/api/handler";

export const GET = api({}, async ({ session }) => ({ user: session.user, permissions: session.permissions }));
