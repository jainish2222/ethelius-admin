import "server-only";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { audit } from "@/lib/audit";
import { actorCan, type Actor } from "@/lib/api/handler";
import { badRequest, forbidden, notFound } from "@/lib/api/errors";
import { csv, orderBy, paging, type ListQuery } from "@/lib/api/list-query";
import { addDays, dateOnly, parseDateOnly, todayDateOnly } from "@/lib/dates";
import { saveUpload } from "@/lib/storage";
import { DOCUMENT_TYPE, SENSITIVE_DOCUMENT_TYPES } from "@/lib/constants";

type DocType = keyof typeof DOCUMENT_TYPE;
const SENSITIVE = SENSITIVE_DOCUMENT_TYPES as readonly string[];

/**
 * Who sees what:
 *  - document.read: all documents, except identity/bank proofs which also need employee.pii
 *  - everyone with self.view: their own employee documents
 */
function scope(actor: Actor): Prisma.DocumentWhereInput {
  if (actorCan(actor, "document.read")) {
    return actorCan(actor, "employee.pii") ? {} : { type: { notIn: SENSITIVE as DocType[] } };
  }
  if (actorCan(actor, "self.view") && actor.employeeId) return { employeeId: actor.employeeId };
  throw forbidden();
}

export async function listDocuments(q: ListQuery, actor: Actor) {
  const where: Prisma.DocumentWhereInput = { deletedAt: null, AND: [scope(actor)] };
  if (q.q) where.OR = [
    { title: { contains: q.q, mode: "insensitive" } },
    { fileName: { contains: q.q, mode: "insensitive" } },
    { employee: { fullName: { contains: q.q, mode: "insensitive" } } },
    { company: { name: { contains: q.q, mode: "insensitive" } } },
  ];
  const types = csv(q.type);
  if (types.length) (where.AND as object[]).push({ type: { in: types as DocType[] } });
  if (q.employeeId) where.employeeId = String(q.employeeId);
  if (q.companyId) where.companyId = String(q.companyId);
  if (q.projectId) where.projectId = String(q.projectId);
  if (q.verified === "yes") where.verified = true;
  if (q.verified === "no") where.verified = false;
  if (q.owner === "employee") where.employeeId = { not: null };
  if (q.owner === "company") where.companyId = { not: null };
  if (q.owner === "project") where.projectId = { not: null };
  if (q.expiring === "true") where.expiryDate = { lte: addDays(parseDateOnly(todayDateOnly()), 60) };

  const [rows, total] = await Promise.all([
    prisma.document.findMany({
      where,
      orderBy: orderBy(q, {
        title: (d) => ({ title: d }),
        type: (d) => ({ type: d }),
        uploadedAt: (d) => ({ uploadedAt: d }),
        expiryDate: (d) => ({ expiryDate: d }),
      }, { uploadedAt: "desc" } as Prisma.DocumentOrderByWithRelationInput),
      ...paging(q),
      include: {
        employee: { select: { id: true, fullName: true, employeeCode: true } },
        company: { select: { id: true, name: true } },
        project: { select: { id: true, name: true } },
        uploadedBy: { select: { name: true } },
        verifiedBy: { select: { name: true } },
      },
    }),
    prisma.document.count({ where }),
  ]);
  return {
    total, page: q.page, pageSize: q.pageSize,
    data: rows.map(({ filePath: _p, ...d }) => ({ ...d, expiryDate: dateOnly(d.expiryDate) })),
  };
}

export async function uploadDocument(form: FormData, actor: Actor) {
  const file = form.get("file") as File | null;
  const type = String(form.get("type") ?? "") as DocType;
  const title = String(form.get("title") ?? "").trim();
  const employeeId = (form.get("employeeId") as string) || null;
  const companyId = (form.get("companyId") as string) || null;
  const projectId = (form.get("projectId") as string) || null;
  const expiry = (form.get("expiryDate") as string) || null;
  const notes = ((form.get("notes") as string) || "").trim() || null;

  if (!(type in DOCUMENT_TYPE)) throw badRequest("Choose a document type.");
  if ([employeeId, companyId, projectId].filter(Boolean).length !== 1) throw badRequest("Attach the document to exactly one employee, company or project.");
  if (expiry && !/^\d{4}-\d{2}-\d{2}$/.test(expiry)) throw badRequest("Expiry date is not valid.");

  const self = !!employeeId && employeeId === actor.employeeId;
  if (!actorCan(actor, "document.write") && !(self && actorCan(actor, "self.view"))) throw forbidden();
  if (SENSITIVE.includes(type) && !actorCan(actor, "employee.pii") && !self) throw forbidden("Identity and bank documents need PII clearance.");

  let folder: string[];
  if (employeeId) {
    if (!(await prisma.employee.findFirst({ where: { id: employeeId, deletedAt: null } }))) throw notFound("Employee");
    folder = ["employee", employeeId, "documents"];
  } else if (companyId) {
    if (!(await prisma.company.findFirst({ where: { id: companyId, deletedAt: null } }))) throw notFound("Company");
    folder = ["company", companyId];
  } else {
    if (!(await prisma.project.findFirst({ where: { id: projectId!, deletedAt: null } }))) throw notFound("Project");
    folder = ["project", projectId!];
  }

  const rel = await saveUpload(file as File, folder);
  const doc = await prisma.document.create({
    data: {
      employeeId, companyId, projectId, type,
      title: title || DOCUMENT_TYPE[type],
      fileName: (file as File).name.slice(0, 200),
      filePath: rel,
      mimeType: (file as File).type,
      size: (file as File).size,
      expiryDate: expiry ? parseDateOnly(expiry) : null,
      notes,
      uploadedById: actor.userId,
    },
  });
  await audit(actor, { action: "document.uploaded", entity: "Document", entityId: doc.id, newValue: { type, title: doc.title, employeeId, companyId, projectId } });
  return doc;
}

export async function getDocumentFile(id: string, actor: Actor) {
  const doc = await prisma.document.findFirst({ where: { id, deletedAt: null, AND: [scope(actor)] } });
  if (!doc) throw notFound("Document");
  // Viewing a sensitive file leaves a trail.
  if (SENSITIVE.includes(doc.type)) await audit(actor, { action: "document.viewed", entity: "Document", entityId: id });
  return doc;
}

export async function verifyDocument(id: string, verified: boolean, actor: Actor) {
  const doc = await prisma.document.findFirst({ where: { id, deletedAt: null, AND: [scope(actor)] } });
  if (!doc) throw notFound("Document");
  await prisma.document.update({
    where: { id },
    data: { verified, verifiedById: verified ? actor.userId : null, verifiedAt: verified ? new Date() : null },
  });
  await audit(actor, { action: verified ? "document.verified" : "document.unverified", entity: "Document", entityId: id });
}

export async function archiveDocument(id: string, actor: Actor) {
  const doc = await prisma.document.findFirst({ where: { id, deletedAt: null, AND: [scope(actor)] } });
  if (!doc) throw notFound("Document");
  await prisma.document.update({ where: { id }, data: { deletedAt: new Date() } });
  await audit(actor, { action: "document.archived", entity: "Document", entityId: id, oldValue: { title: doc.title, type: doc.type } });
}
