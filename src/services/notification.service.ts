import "server-only";
import { prisma } from "@/lib/prisma";
import { notify } from "@/lib/notify";
import { addDays, dateOnly, parseDateOnly, todayDateOnly } from "@/lib/dates";
import { syncOverdueInvoices } from "./invoice.service";
import { getSetting, setSetting, SETTING_KEYS } from "./settings.service";

export async function listNotifications(userId: string, opts: { unreadOnly?: boolean; limit?: number } = {}) {
  await runScheduledChecks();
  const [items, unread] = await Promise.all([
    prisma.notification.findMany({
      where: { userId, ...(opts.unreadOnly ? { readAt: null } : {}) },
      orderBy: { createdAt: "desc" },
      take: opts.limit ?? 30,
    }),
    prisma.notification.count({ where: { userId, readAt: null } }),
  ]);
  return { items, unread };
}

export async function markRead(userId: string, ids: string[] | "all") {
  await prisma.notification.updateMany({
    where: { userId, readAt: null, ...(ids === "all" ? {} : { id: { in: ids } }) },
    data: { readAt: new Date() },
  });
}

/**
 * Date-driven alerts (contracts, project ends, joiners, leavers, overdue invoices).
 * There is no cron in this deployment, so this runs at most once an hour, piggy-backing
 * on notification polling. Each alert carries a dedupe key so it is raised only once.
 */
export async function runScheduledChecks(force = false) {
  const last = await getSetting<string | null>(SETTING_KEYS.lastScheduledCheck, null);
  if (!force && last && Date.now() - new Date(last).getTime() < 60 * 60 * 1000) return;
  await setSetting(SETTING_KEYS.lastScheduledCheck, new Date().toISOString(), null);

  const today = parseDateOnly(todayDateOnly());
  const in30 = addDays(today, 30);
  const in7 = addDays(today, 7);

  await syncOverdueInvoices();

  const contracts = await prisma.company.findMany({ where: { deletedAt: null, status: "ACTIVE", contractEnd: { gte: today, lte: in30 } } });
  for (const c of contracts) {
    await notify({
      type: "CONTRACT_EXPIRING", title: `${c.name} contract ends ${dateOnly(c.contractEnd)}`,
      body: "Renew or plan the wind-down.", link: `/companies/${c.id}`,
      permission: "company.write", dedupeKey: `contract:${c.id}:${dateOnly(c.contractEnd)}`,
    });
  }

  const projects = await prisma.project.findMany({ where: { deletedAt: null, status: "ACTIVE", endDate: { gte: today, lte: in30 } }, include: { company: true } });
  for (const p of projects) {
    await notify({
      type: "PROJECT_ENDING", title: `${p.name} ends ${dateOnly(p.endDate)}`,
      body: `${p.company.name} · plan the team's next assignments`, link: `/projects/${p.id}`,
      permission: "project.write", dedupeKey: `project-end:${p.id}:${dateOnly(p.endDate)}`,
    });
  }

  const joiners = await prisma.employee.findMany({ where: { deletedAt: null, joiningDate: { gte: today, lte: in7 } } });
  for (const e of joiners) {
    await notify({
      type: "EMPLOYEE_JOINING", title: `${e.fullName} joins ${dateOnly(e.joiningDate)}`,
      body: `${e.designation} · ${e.department}`, link: `/employees/${e.id}`,
      permission: "employee.write", dedupeKey: `joining:${e.id}`,
    });
  }

  const leavers = await prisma.employee.findMany({ where: { deletedAt: null, exitDate: { gte: today, lte: in30 } } });
  for (const e of leavers) {
    await notify({
      type: "EMPLOYEE_LEAVING", title: `${e.fullName}'s last day is ${dateOnly(e.exitDate)}`,
      body: "Plan handover and the final settlement.", link: `/employees/${e.id}`,
      permission: "employee.write", dedupeKey: `leaving:${e.id}:${dateOnly(e.exitDate)}`,
    });
  }
}
