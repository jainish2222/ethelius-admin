import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { ZodError, type ZodType } from "zod";
import { getSession, clientIp, type Session } from "@/lib/auth/session";
import { can, type Permission } from "@/lib/permissions";
import { serialize } from "@/lib/serialize";
import { ApiError, badRequest, forbidden, unauthorized } from "./errors";

/** Who is acting — passed into services for authorisation, scoping and the audit log. */
export type Actor = {
  userId: string;
  userName: string;
  employeeId: string | null;
  permissions: Set<string>;
  ip: string | null;
  userAgent: string | null;
};

export const actorFrom = (session: Session, req?: Request): Actor => ({
  userId: session.user.id,
  userName: session.user.name,
  employeeId: session.user.employeeId,
  permissions: new Set(session.permissions),
  ip: req ? clientIp(req.headers) : null,
  userAgent: req?.headers.get("user-agent")?.slice(0, 300) ?? null,
});

export const actorCan = (actor: Actor, p: Permission | Permission[], mode: "all" | "any" = "all") =>
  can(actor.permissions, p, mode);

export function requirePermission(actor: Actor, p: Permission | Permission[], mode: "all" | "any" = "all") {
  if (!actorCan(actor, p, mode)) throw forbidden();
}

type Options = {
  /** Every listed permission is required (or any one, with `mode: "any"`). */
  permission?: Permission | Permission[];
  mode?: "all" | "any";
  /** Allow unauthenticated calls (login only). */
  public?: boolean;
};

type Context<P> = {
  req: NextRequest;
  params: P;
  actor: Actor;
  session: Session;
  /** Parses and validates the JSON body. */
  body: <T>(schema: ZodType<T>) => Promise<T>;
  /** Query string as a plain object. */
  query: Record<string, string>;
};

type RouteCtx = { params: Promise<Record<string, string | string[]>> };

/**
 * Wraps a route handler with authentication, permission checks, validation and
 * consistent error responses. Returning a plain value sends it as JSON (Decimals → numbers).
 */
export function api<P = Record<string, string>>(opts: Options, handler: (ctx: Context<P>) => Promise<unknown>) {
  return async (req: NextRequest, routeCtx: RouteCtx) => {
    try {
      const session = await getSession();
      if (!session && !opts.public) throw unauthorized();
      const actor = session ? actorFrom(session, req) : (null as unknown as Actor);
      if (opts.permission && session) requirePermission(actor, opts.permission, opts.mode);

      const params = (routeCtx?.params ? await routeCtx.params : {}) as P;
      const query = Object.fromEntries(req.nextUrl.searchParams.entries());
      const body = async <T,>(schema: ZodType<T>) => {
        let raw: unknown;
        try {
          raw = await req.json();
        } catch {
          throw badRequest("The request body must be valid JSON.");
        }
        return schema.parse(raw);
      };

      const result = await handler({ req, params, actor, session: session as Session, body, query });
      if (result instanceof Response) return result;
      if (result === undefined) return new NextResponse(null, { status: 204 });
      return NextResponse.json(serialize(result));
    } catch (err) {
      return errorResponse(err);
    }
  };
}

export function created(data: unknown) {
  return NextResponse.json(serialize(data), { status: 201 });
}

export function errorResponse(err: unknown) {
  if (err instanceof ApiError) {
    return NextResponse.json({ error: err.message, ...(err.details ? { details: err.details } : {}) }, { status: err.status });
  }
  if (err instanceof ZodError) {
    const fields: Record<string, string> = {};
    for (const issue of err.issues) {
      const key = issue.path.join(".") || "_";
      if (!fields[key]) fields[key] = issue.message;
    }
    return NextResponse.json({ error: "Some fields need attention.", fields }, { status: 422 });
  }
  const e = err as { name?: string; code?: string; meta?: { target?: string[] | string; modelName?: string } };
  if (e?.name === "PrismaClientKnownRequestError") {
    if (e.code === "P2002") {
      const target = Array.isArray(e.meta?.target) ? e.meta.target.join(", ") : e.meta?.target;
      return NextResponse.json({ error: `A record with this ${target ?? "value"} already exists.` }, { status: 409 });
    }
    if (e.code === "P2025") return NextResponse.json({ error: "Record not found." }, { status: 404 });
    if (e.code === "P2003") return NextResponse.json({ error: "This record is linked to others and cannot be changed that way." }, { status: 409 });
  }
  console.error("[api] unhandled error", err);
  return NextResponse.json({ error: "Something went wrong on our side. Please try again." }, { status: 500 });
}
