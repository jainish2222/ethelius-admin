import "server-only";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { badRequest, notFound } from "@/lib/api/errors";
import { getObject, objectExists, putObject } from "@/lib/object-store";

/**
 * File storage (local disk or S3, see object-store.ts), never public: every read goes through an authorised route.
 * Layout:
 *   company/<companyId>/…      project/<projectId>/…
 *   employee/<employeeId>/documents|photo|expenses/…
 *   payslip/<YYYY-MM>/PAY-….pdf
 *   documents/…                (files not tied to one record)
 */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

const ALLOWED: Record<string, string> = {
  "application/pdf": "pdf",
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
};
export const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"];

const safeName = (name: string) =>
  name.replace(/\.[^.]+$/, "").replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "file";

/** Validates and writes an uploaded file; returns its storage-relative path. */
export async function saveUpload(file: File, folder: string[], opts: { images?: boolean } = {}) {
  if (!file || typeof file === "string" || file.size === 0) throw badRequest("Choose a file to upload.");
  if (file.size > MAX_UPLOAD_BYTES) throw badRequest("Files must be 10 MB or smaller.");
  const ext = ALLOWED[file.type];
  if (!ext || (opts.images && !IMAGE_TYPES.includes(file.type))) {
    throw badRequest(opts.images ? "Upload a PNG, JPG or WebP image." : "Upload a PDF, image or Word document.");
  }
  const rel = path.posix.join(...folder, `${Date.now()}-${randomBytes(4).toString("hex")}-${safeName(file.name)}.${ext}`);
  await writeBuffer(rel, Buffer.from(await file.arrayBuffer()));
  return rel;
}

export async function writeBuffer(rel: string, buf: Buffer) {
  await putObject(rel, buf, mimeFor(rel));
  return rel;
}

export async function readStoredFile(rel: string) {
  const buf = await getObject(rel);
  if (!buf) throw notFound("File");
  return buf;
}

export async function storedFileExists(rel?: string | null) {
  return rel ? objectExists(rel) : false;
}

export function mimeFor(rel: string) {
  const ext = rel.split(".").pop()?.toLowerCase();
  return Object.entries(ALLOWED).find(([, e]) => e === ext)?.[0] ?? "application/octet-stream";
}

/** Streams a stored file back with safe headers. */
export async function fileResponse(rel: string, downloadName?: string, inline = true) {
  const buf = await readStoredFile(rel);
  const name = (downloadName ?? path.basename(rel)).replace(/[^\w.\- ]+/g, "_");
  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": mimeFor(rel),
      "Content-Length": String(buf.length),
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${name}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
