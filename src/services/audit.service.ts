import "server-only";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { orderBy, paging, type ListQuery } from "@/lib/api/list-query";

export async function listAuditLogs(q: ListQuery) {
  const where: Prisma.AuditLogWhereInput = {};
  if (q.q) where.OR = [
    { action: { contains: q.q, mode: "insensitive" } },
    { userName: { contains: q.q, mode: "insensitive" } },
    { entityId: { contains: q.q } },
  ];
  if (q.entity) where.entity = String(q.entity);
  if (q.userId) where.userId = String(q.userId);
  if (q.entityId) where.entityId = String(q.entityId);
  if (q.action) where.action = { startsWith: String(q.action) };
  if (q.from || q.to) where.createdAt = {
    ...(q.from ? { gte: new Date(`${q.from}T00:00:00`) } : {}),
    ...(q.to ? { lte: new Date(`${q.to}T23:59:59.999`) } : {}),
  };
  const [rows, total, entities] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: orderBy(q, { createdAt: (d) => ({ createdAt: d }), action: (d) => ({ action: d }), user: (d) => ({ userName: d }) }, { createdAt: "desc" } as Prisma.AuditLogOrderByWithRelationInput),
      ...paging(q),
    }),
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({ distinct: ["entity"], select: { entity: true }, orderBy: { entity: "asc" } }),
  ]);
  return { data: rows, total, page: q.page, pageSize: q.pageSize, entities: entities.map((e) => e.entity) };
}

/** Recent activity for a record (e.g. the Activity tab on an employee or project). */
export async function activityFor(filters: { entity?: string; entityIds: string[] }, take = 40) {
  return prisma.auditLog.findMany({
    where: { entityId: { in: filters.entityIds }, ...(filters.entity ? { entity: filters.entity } : {}) },
    orderBy: { createdAt: "desc" },
    take,
    select: { id: true, action: true, entity: true, entityId: true, userName: true, createdAt: true, newValue: true, oldValue: true },
  });
}
