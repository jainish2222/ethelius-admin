import "server-only";
import type { z } from "zod";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import type { Actor } from "@/lib/api/handler";
import { badRequest, conflict, notFound } from "@/lib/api/errors";
import { PERMISSIONS, type RoleKey } from "@/lib/permissions";
import type { userCreateSchema, userUpdateSchema } from "@/validations/system";
import { hashPassword } from "./auth.service";

type CreateData = z.output<typeof userCreateSchema>;
type UpdateData = z.output<typeof userUpdateSchema>;

export async function listUsers() {
  const users = await prisma.user.findMany({
    orderBy: [{ isActive: "desc" }, { name: "asc" }],
    include: { role: { select: { key: true, name: true } }, employee: { select: { id: true, fullName: true, employeeCode: true } } },
  });
  return users.map(({ passwordHash: _h, ...u }) => ({ ...u, locked: !!u.lockedUntil && u.lockedUntil > new Date() }));
}

export async function listRoles() {
  const roles = await prisma.role.findMany({
    orderBy: { key: "asc" },
    include: { permissions: { include: { permission: { select: { key: true } } } }, _count: { select: { users: true } } },
  });
  return {
    roles: roles.map((r) => ({ id: r.id, key: r.key, name: r.name, description: r.description, users: r._count.users, permissions: r.permissions.map((p) => p.permission.key) })),
    catalogue: Object.entries(PERMISSIONS).map(([key, v]) => ({ key, ...v })),
  };
}

async function roleId(key: RoleKey) {
  const r = await prisma.role.findUnique({ where: { key } });
  if (!r) throw notFound("Role");
  return r.id;
}

async function assertEmployeeFree(employeeId: string | null, userId?: string) {
  if (!employeeId) return;
  const taken = await prisma.user.findFirst({ where: { employeeId, id: userId ? { not: userId } : undefined } });
  if (taken) throw conflict(`That employee is already linked to ${taken.email}.`);
}

export async function createUser(input: CreateData, actor: Actor) {
  if (input.role === "EMPLOYEE" && !input.employeeId) throw badRequest("Employee accounts must be linked to an employee record.");
  await assertEmployeeFree(input.employeeId);
  const u = await prisma.user.create({
    data: {
      name: input.name, email: input.email, roleId: await roleId(input.role), employeeId: input.employeeId,
      isActive: input.isActive, passwordHash: await hashPassword(input.password),
    },
  });
  await audit(actor, { action: "user.created", entity: "User", entityId: u.id, newValue: { email: u.email, role: input.role } });
  return { id: u.id };
}

export async function updateUser(id: string, input: UpdateData, actor: Actor) {
  const before = await prisma.user.findUnique({ where: { id }, include: { role: true } });
  if (!before) throw notFound("User");
  if (id === actor.userId && (!input.isActive || input.role !== before.role.key)) {
    throw badRequest("You cannot deactivate yourself or change your own role.");
  }
  if (input.role === "EMPLOYEE" && !input.employeeId) throw badRequest("Employee accounts must be linked to an employee record.");
  await assertEmployeeFree(input.employeeId, id);
  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id },
      data: {
        name: input.name, roleId: await roleId(input.role), employeeId: input.employeeId, isActive: input.isActive,
        ...(input.password ? { passwordHash: await hashPassword(input.password), failedLogins: 0, lockedUntil: null } : {}),
      },
    });
    // Access changes take effect immediately.
    if (!input.isActive || input.password || input.role !== before.role.key) await tx.session.deleteMany({ where: { userId: id } });
  });
  await audit(actor, {
    action: "user.updated", entity: "User", entityId: id,
    oldValue: { name: before.name, role: before.role.key, isActive: before.isActive, employeeId: before.employeeId },
    newValue: { name: input.name, role: input.role, isActive: input.isActive, employeeId: input.employeeId, passwordReset: !!input.password },
  });
}

export async function setRolePermissions(key: RoleKey, permissions: string[], actor: Actor) {
  if (key === "SUPER_ADMIN") throw badRequest("Super admin always has every permission.");
  const valid = permissions.filter((p) => p in PERMISSIONS);
  const role = await prisma.role.findUnique({ where: { key }, include: { permissions: { include: { permission: true } } } });
  if (!role) throw notFound("Role");
  const perms = await prisma.permission.findMany({ where: { key: { in: valid } } });
  await prisma.$transaction([
    prisma.rolePermission.deleteMany({ where: { roleId: role.id } }),
    prisma.rolePermission.createMany({ data: perms.map((p) => ({ roleId: role.id, permissionId: p.id })) }),
  ]);
  await audit(actor, {
    action: "role.permissions_updated", entity: "Role", entityId: role.id,
    oldValue: { role: key, permissions: role.permissions.map((p) => p.permission.key) },
    newValue: { role: key, permissions: valid },
  });
}
