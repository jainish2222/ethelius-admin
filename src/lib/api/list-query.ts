import { z } from "zod";

/** Shared pagination / sort / search parameters for every list endpoint. */
export const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(5000).default(25),
  q: z.string().trim().max(200).optional(),
  sort: z.string().max(60).optional(),
  order: z.enum(["asc", "desc"]).default("desc"),
});

export type ListQuery = z.infer<typeof listQuerySchema> & Record<string, string | number | undefined>;

export type ListResult<T> = { data: T[]; total: number; page: number; pageSize: number };

export function parseList(query: Record<string, string>): ListQuery {
  const base = listQuerySchema.parse(query);
  return { ...query, ...base };
}

export const paging = (q: ListQuery) => ({ skip: (q.page - 1) * q.pageSize, take: q.pageSize });

/**
 * Maps a public sort key to a Prisma orderBy, falling back to the default.
 * Only whitelisted keys are accepted, so clients cannot sort by arbitrary columns.
 */
export function orderBy<T>(q: ListQuery, map: Record<string, (dir: "asc" | "desc") => T>, fallback: T | T[]): T | T[] {
  const fn = q.sort ? map[q.sort] : undefined;
  return fn ? fn(q.order) : fallback;
}

/** Splits "A,B" filter values into a list, ignoring empties. */
export const csv = (v?: string | number) => (v == null ? [] : String(v).split(",").map((s) => s.trim()).filter(Boolean));
