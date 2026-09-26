import { NextResponse } from "next/server";
import { api } from "@/lib/api/handler";
import { logout } from "@/services/auth.service";

export const POST = api({ public: true }, async ({ actor }) => {
  await logout(actor ?? null);
  return NextResponse.json({ ok: true });
});
