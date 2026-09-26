import "server-only";
import { prisma } from "@/lib/prisma";
import { actorCan, type Actor } from "@/lib/api/handler";

export type SearchHit = { type: "employee" | "company" | "project" | "invoice" | "payslip"; id: string; title: string; subtitle: string; href: string };

/** Header search across the records the actor is allowed to open. */
export async function globalSearch(q: string, actor: Actor): Promise<SearchHit[]> {
  const term = q.trim();
  if (term.length < 2) return [];
  const ci = { contains: term, mode: "insensitive" as const };
  const hits: SearchHit[] = [];

  const tasks: Promise<void>[] = [];
  if (actorCan(actor, "employee.read")) tasks.push(
    prisma.employee.findMany({
      where: { deletedAt: null, OR: [{ fullName: ci }, { employeeCode: ci }, { officialEmail: ci }, { designation: ci }] },
      take: 6, select: { id: true, fullName: true, employeeCode: true, designation: true },
    }).then((r) => { r.forEach((e) => hits.push({ type: "employee", id: e.id, title: e.fullName, subtitle: `${e.employeeCode} · ${e.designation}`, href: `/employees/${e.id}` })); }),
  );
  if (actorCan(actor, "company.read")) tasks.push(
    prisma.company.findMany({
      where: { deletedAt: null, OR: [{ name: ci }, { legalName: ci }, { gstNumber: ci }] },
      take: 5, select: { id: true, name: true, legalName: true },
    }).then((r) => { r.forEach((c) => hits.push({ type: "company", id: c.id, title: c.name, subtitle: c.legalName ?? "Company", href: `/companies/${c.id}` })); }),
  );
  if (actorCan(actor, "project.read")) tasks.push(
    prisma.project.findMany({
      where: { deletedAt: null, OR: [{ name: ci }, { code: ci }] },
      take: 5, select: { id: true, name: true, code: true, company: { select: { name: true } } },
    }).then((r) => { r.forEach((p) => hits.push({ type: "project", id: p.id, title: p.name, subtitle: `${p.code} · ${p.company.name}`, href: `/projects/${p.id}` })); }),
  );
  if (actorCan(actor, "billing.read")) tasks.push(
    prisma.invoice.findMany({
      where: { deletedAt: null, invoiceNumber: ci },
      take: 5, select: { id: true, invoiceNumber: true, company: { select: { name: true } }, billingMonth: true },
    }).then((r) => { r.forEach((i) => hits.push({ type: "invoice", id: i.id, title: i.invoiceNumber, subtitle: `${i.company.name}${i.billingMonth ? ` · ${i.billingMonth}` : ""}`, href: `/invoices/${i.id}` })); }),
  );
  if (actorCan(actor, "payslip.read")) tasks.push(
    prisma.payslip.findMany({
      where: { deletedAt: null, payslipNumber: ci },
      take: 5, select: { id: true, payslipNumber: true, employee: { select: { fullName: true } } },
    }).then((r) => { r.forEach((s) => hits.push({ type: "payslip", id: s.id, title: s.payslipNumber, subtitle: s.employee.fullName, href: `/payslips/${s.id}` })); }),
  );
  await Promise.all(tasks);
  return hits;
}
