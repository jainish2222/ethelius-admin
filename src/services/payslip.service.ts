import "server-only";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { audit } from "@/lib/audit";
import { notify } from "@/lib/notify";
import { actorCan, type Actor } from "@/lib/api/handler";
import { ApiError, badRequest, conflict, forbidden, notFound } from "@/lib/api/errors";
import { orderBy, paging, type ListQuery } from "@/lib/api/list-query";
import { dateOnly, monthLabel, todayDateOnly } from "@/lib/dates";
import { dec } from "@/lib/serialize";
import { htmlToPdf } from "@/lib/pdf";
import { payslipFontCss } from "@/lib/payslip-font";
import { readStoredFile, storedFileExists, writeBuffer } from "@/lib/storage";
import { renderPayslipHtml, type PayslipData } from "@/features/payslips/template";
import { getBrandImages, getCompanyProfile, getPayslipTemplate } from "./settings.service";
import { LOCKED } from "./payroll.service";

const PAYROLL_INCLUDE = {
  employee: true,
  items: { orderBy: { sortOrder: "asc" } },
  deductions: { orderBy: { sortOrder: "asc" } },
  bankAccount: true,
  payslip: true,
} satisfies Prisma.PayrollInclude;

type PayrollFull = Prisma.PayrollGetPayload<{ include: typeof PAYROLL_INCLUDE }>;

export function payslipNumber(prefix: string, month: string, employeeCode: string) {
  return `${prefix}-${month.slice(0, 4)}-${month.slice(5, 7)}-${employeeCode.toUpperCase()}`;
}

/** Everything that prints on the slip, assembled from the payroll and current settings. */
async function buildData(p: PayrollFull, number: string, issuedOn: string): Promise<PayslipData> {
  const [company, template, images, att] = await Promise.all([
    getCompanyProfile(),
    getPayslipTemplate(),
    getBrandImages(),
    prisma.attendance.findUnique({ where: { employeeId_month: { employeeId: p.employeeId, month: p.month } } }),
  ]);
  const e = p.employee;
  const working = dec(p.workingDays);
  const lop = dec(p.lopDays);
  return {
    payslipNumber: number,
    issuedOn,
    month: p.month,
    currency: "INR",
    company: { name: company.name, address: company.address, email: company.email, phone: company.phone, regNo: company.regNo, logo: images.logo || null },
    employee: {
      name: e.fullName, code: e.employeeCode, designation: e.designation, department: e.department,
      joiningDate: dateOnly(e.joiningDate), location: e.workLocation,
      pan: e.pan, uan: e.uan, pfNumber: e.pfNumber, esiNumber: e.esiNumber,
    },
    attendance: {
      workingDays: working,
      presentDays: att ? dec(att.presentDays) : working - lop,
      paidDays: dec(p.paidDays),
      lopDays: lop,
      leaveBalance: att?.leaveBalance == null ? null : dec(att.leaveBalance),
    },
    earnings: p.items.map((i) => ({ label: i.label, amount: dec(i.amount) })),
    deductions: p.deductions.map((d) => ({ label: d.label, amount: dec(d.amount) })),
    gross: dec(p.grossEarnings),
    totalDeductions: dec(p.totalDeductions),
    net: dec(p.netSalary),
    bank: p.bankAccount
      ? { name: p.bankAccount.bankName, holder: p.bankAccount.accountHolder, account: p.bankAccount.accountNumber, ifsc: p.bankAccount.ifsc, branch: p.bankAccount.branch }
      : null,
    payment: {
      mode: p.paymentMode ?? (p.bankAccount ? "Bank transfer" : null),
      creditDate: dateOnly(p.bankCreditDate) || null,
      reference: p.transactionRef,
      status: p.paymentStatus,
      actualCredit: p.actualBankCredit == null ? null : dec(p.actualBankCredit),
    },
    signature: images.signature || null,
    template,
  };
}

async function loadPayroll(id: string) {
  const p = await prisma.payroll.findFirst({ where: { id, deletedAt: null }, include: PAYROLL_INCLUDE });
  if (!p) throw notFound("Payroll");
  return p;
}

/** Live preview for any payroll (watermarked until it is approved). */
export async function previewPayrollHtml(payrollId: string, actor: Actor) {
  const p = await loadPayroll(payrollId);
  if (!actorCan(actor, "payroll.read")) throw forbidden();
  const template = await getPayslipTemplate();
  const data = await buildData(p, p.payslip?.payslipNumber ?? payslipNumber(template.numberPrefix, p.month, p.employee.employeeCode), todayDateOnly());
  return renderPayslipHtml(data, { draft: !LOCKED.includes(p.status), fontCss: await payslipFontCss() });
}

function scope(actor: Actor): Prisma.PayslipWhereInput {
  if (actorCan(actor, "payslip.read")) return {};
  if (actorCan(actor, "self.view") && actor.employeeId) return { employeeId: actor.employeeId };
  throw forbidden();
}

export async function listPayslips(q: ListQuery, actor: Actor) {
  const where: Prisma.PayslipWhereInput = { deletedAt: null, ...scope(actor) };
  if (q.month) where.month = String(q.month);
  if (q.year) where.month = { startsWith: `${q.year}-` };
  if (q.employeeId && actorCan(actor, "payslip.read")) where.employeeId = String(q.employeeId);
  if (q.emailed === "yes") where.emailedAt = { not: null };
  if (q.emailed === "no") where.emailedAt = null;
  if (q.q) where.OR = [
    { payslipNumber: { contains: q.q, mode: "insensitive" } },
    { employee: { fullName: { contains: q.q, mode: "insensitive" } } },
    { employee: { employeeCode: { contains: q.q, mode: "insensitive" } } },
  ];
  const [rows, total] = await Promise.all([
    prisma.payslip.findMany({
      where,
      orderBy: orderBy(q, {
        payslipNumber: (d) => ({ payslipNumber: d }),
        employee: (d) => ({ employee: { fullName: d } }),
        month: (d) => ({ month: d }),
        generatedAt: (d) => ({ generatedAt: d }),
      }, [{ month: "desc" }, { payslipNumber: "asc" }] as Prisma.PayslipOrderByWithRelationInput[]),
      ...paging(q),
      include: {
        employee: { select: { id: true, fullName: true, employeeCode: true, designation: true, officialEmail: true } },
        payroll: { select: { id: true, netSalary: true, grossEarnings: true, paymentStatus: true, actualBankCredit: true, bankCreditDate: true } },
        generatedBy: { select: { name: true } },
      },
    }),
    prisma.payslip.count({ where }),
  ]);
  return {
    total, page: q.page, pageSize: q.pageSize,
    data: rows.map(({ snapshot: _s, ...r }) => ({ ...r, payroll: { ...r.payroll, bankCreditDate: dateOnly(r.payroll.bankCreditDate) } })),
  };
}

export async function getPayslip(id: string, actor: Actor) {
  const s = await prisma.payslip.findFirst({
    where: { id, deletedAt: null, ...scope(actor) },
    include: {
      employee: { select: { id: true, fullName: true, employeeCode: true, officialEmail: true, personalEmail: true } },
      payroll: { select: { id: true, status: true, paymentStatus: true, netSalary: true } },
      generatedBy: { select: { name: true } },
    },
  });
  if (!s) throw notFound("Payslip");
  return s;
}

export async function payslipHtml(id: string, actor: Actor, mode: "screen" | "print" = "screen") {
  const s = await getPayslip(id, actor);
  return renderPayslipHtml(s.snapshot as unknown as PayslipData, { mode, fontCss: await payslipFontCss() });
}

async function renderAndStore(data: PayslipData) {
  const pdf = await htmlToPdf(renderPayslipHtml(data, { mode: "print", fontCss: await payslipFontCss() }));
  const rel = `payslip/${data.month}/${data.payslipNumber}.pdf`;
  await writeBuffer(rel, pdf);
  return { rel, pdf };
}

/**
 * Generates (or regenerates) payslips for approved payroll. The slip's content is frozen
 * into `snapshot` so later edits to employee or company details never alter an issued slip.
 */
export async function generatePayslips(payrollIds: string[], regenerate: boolean, actor: Actor) {
  const template = await getPayslipTemplate();
  const results: { payrollId: string; payslipId?: string; payslipNumber?: string; error?: string }[] = [];

  for (const id of payrollIds) {
    try {
      const p = await loadPayroll(id);
      if (!LOCKED.includes(p.status)) throw conflict(`${p.employee.fullName}: approve the payroll before generating a payslip.`);
      if (p.payslip && !regenerate) { results.push({ payrollId: id, payslipId: p.payslip.id, payslipNumber: p.payslip.payslipNumber }); continue; }

      const number = p.payslip?.payslipNumber ?? payslipNumber(template.numberPrefix, p.month, p.employee.employeeCode);
      const data = await buildData(p, number, todayDateOnly());
      const { rel } = await renderAndStore(data);
      const slip = p.payslip
        ? await prisma.payslip.update({
            where: { id: p.payslip.id },
            data: { snapshot: data as unknown as Prisma.InputJsonValue, filePath: rel, generatedAt: new Date(), generatedById: actor.userId, deletedAt: null },
          })
        : await prisma.payslip.create({
            data: {
              payslipNumber: number, payrollId: p.id, employeeId: p.employeeId, month: p.month,
              snapshot: data as unknown as Prisma.InputJsonValue, filePath: rel, generatedById: actor.userId,
            },
          });
      await audit(actor, {
        action: p.payslip ? "payslip.regenerated" : "payslip.generated", entity: "Payslip", entityId: slip.id,
        newValue: { payslipNumber: number, employee: p.employee.employeeCode, month: p.month, net: data.net },
      });
      const user = await prisma.user.findUnique({ where: { employeeId: p.employeeId }, select: { id: true } });
      if (user) {
        await notify({
          type: "PAYSLIP_GENERATED",
          title: `Your payslip for ${monthLabel(p.month)} is ready`,
          body: number,
          link: `/payslips/${slip.id}`,
          userIds: [user.id],
          dedupeKey: `payslip:${slip.id}:${slip.generatedAt.getTime()}`,
        });
      }
      results.push({ payrollId: id, payslipId: slip.id, payslipNumber: number });
    } catch (e) {
      results.push({ payrollId: id, error: e instanceof ApiError ? e.message : `Could not generate: ${(e as Error).message}` });
    }
  }
  return results;
}

/** The stored PDF, rebuilt from the frozen snapshot if the file has gone missing. */
export async function payslipPdf(id: string, actor: Actor) {
  const s = await getPayslip(id, actor);
  if (s.filePath && (await storedFileExists(s.filePath))) return { buffer: await readStoredFile(s.filePath), name: `${s.payslipNumber}.pdf` };
  const { rel, pdf } = await renderAndStore(s.snapshot as unknown as PayslipData);
  await prisma.payslip.update({ where: { id }, data: { filePath: rel } });
  return { buffer: pdf, name: `${s.payslipNumber}.pdf` };
}

export async function emailPayslip(id: string, to: string | undefined, actor: Actor) {
  if (!actorCan(actor, "payslip.write")) throw forbidden();
  const s = await getPayslip(id, actor);
  const recipient = to ?? s.employee.officialEmail ?? s.employee.personalEmail;
  if (!recipient) throw badRequest("This employee has no email address on file. Enter one to send the payslip.");
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new ApiError(503, "Email is not configured. Set RESEND_API_KEY (and EMAIL_FROM) in the server environment to send payslips.");

  const { buffer, name } = await payslipPdf(id, actor);
  const company = await getCompanyProfile();
  const { Resend } = await import("resend");
  const resend = new Resend(key);
  const period = monthLabel(s.month);
  const { error } = await resend.emails.send({
    from: process.env.EMAIL_FROM || `Payroll <payroll@ethelius.com>`,
    to: recipient,
    subject: `Your payslip for ${period} — ${company.name}`,
    text: `Hi ${s.employee.fullName.split(" ")[0]},\n\nYour payslip for ${period} (${s.payslipNumber}) is attached.\n\n— ${company.name} payroll`,
    attachments: [{ filename: name, content: buffer.toString("base64") }],
  });
  if (error) throw new ApiError(502, `The email service rejected the message: ${error.message}`);
  await prisma.payslip.update({ where: { id }, data: { emailedAt: new Date(), emailedTo: recipient } });
  await audit(actor, { action: "payslip.emailed", entity: "Payslip", entityId: id, newValue: { to: recipient, payslipNumber: s.payslipNumber } });
  return { to: recipient };
}

export async function archivePayslip(id: string, actor: Actor) {
  const s = await prisma.payslip.findFirst({ where: { id, deletedAt: null } });
  if (!s) throw notFound("Payslip");
  await prisma.payslip.update({ where: { id }, data: { deletedAt: new Date() } });
  await audit(actor, { action: "payslip.archived", entity: "Payslip", entityId: id, oldValue: { payslipNumber: s.payslipNumber } });
}
