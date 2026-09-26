import { NextResponse } from "next/server";
import { api } from "@/lib/api/handler";
import { clientIp } from "@/lib/auth/session";
import { loginSchema } from "@/validations/system";
import { login } from "@/services/auth.service";

export const POST = api({ public: true }, async ({ req, body }) => {
  const input = await body(loginSchema);
  await login(input, clientIp(req.headers), req.headers.get("user-agent"));
  return NextResponse.json({ ok: true });
});
