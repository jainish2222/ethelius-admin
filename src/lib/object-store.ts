import { mkdir, readFile, writeFile, stat } from "node:fs/promises";
import path from "node:path";
import { GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client, S3ServiceException } from "@aws-sdk/client-s3";
import { badRequest } from "@/lib/api/errors";

/**
 * Where stored files physically live, addressed by storage-relative POSIX paths ("payslip/2026-09/PAY-….pdf").
 *   - S3 when S3_BUCKET_NAME is set. Keys are prefixed with S3_KEY_PREFIX (default "ethelius-admin/") so the bucket
 *     can be shared with other sites. Region and credentials come from the AWS SDK's default chain
 *     (AWS_REGION + AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY, or an instance/task role).
 *   - Otherwise local disk under STORAGE_DIR (default ./storage) — the development default.
 * No "server-only" here so the seed script can write through it too; app code goes through @/lib/storage.
 * Stored files are runtime data, so every fs call is excluded from build tracing (turbopackIgnore).
 */
interface ObjectStore {
  put(rel: string, body: Buffer, contentType: string): Promise<void>;
  get(rel: string): Promise<Buffer | null>;
  exists(rel: string): Promise<boolean>;
}

function cleanRel(rel: string) {
  const norm = path.posix.normalize(rel);
  if (!rel || /[\\\0]/.test(rel) || path.posix.isAbsolute(norm) || norm === "." || norm === ".." || norm.startsWith("../")) {
    throw badRequest("Invalid file path.");
  }
  return norm;
}

function localStore(): ObjectStore {
  const root = path.resolve(/*turbopackIgnore: true*/ process.env.STORAGE_DIR || "./storage");
  const resolve = (rel: string) => {
    const full = path.resolve(root, cleanRel(rel));
    if (!full.startsWith(root + path.sep)) throw badRequest("Invalid file path.");
    return full;
  };
  return {
    async put(rel, body) {
      const full = resolve(rel);
      await mkdir(/*turbopackIgnore: true*/ path.dirname(full), { recursive: true });
      await writeFile(/*turbopackIgnore: true*/ full, body);
    },
    async get(rel) {
      const full = resolve(rel);
      try {
        return await readFile(/*turbopackIgnore: true*/ full);
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code === "ENOENT" || (e as NodeJS.ErrnoException).code === "EISDIR") return null;
        throw e;
      }
    },
    async exists(rel) {
      const full = resolve(rel);
      try {
        return (await stat(/*turbopackIgnore: true*/ full)).isFile();
      } catch {
        return false;
      }
    },
  };
}

function s3Store(bucket: string): ObjectStore {
  const client = new S3Client({});
  const raw = process.env.S3_KEY_PREFIX ?? "ethelius-admin/";
  const prefix = raw ? raw.replace(/^\/+|\/+$/g, "") + "/" : "";
  const key = (rel: string) => prefix + cleanRel(rel);
  // A missing key is a 404 only if the credentials may s3:ListBucket; otherwise S3 answers 403.
  const missing = (e: unknown) =>
    e instanceof S3ServiceException && (e.name === "NoSuchKey" || e.name === "NotFound" || e.$metadata.httpStatusCode === 404);
  return {
    async put(rel, body, contentType) {
      await client.send(new PutObjectCommand({ Bucket: bucket, Key: key(rel), Body: body, ContentType: contentType }));
    },
    async get(rel) {
      try {
        const res = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key(rel) }));
        return res.Body ? Buffer.from(await res.Body.transformToByteArray()) : null;
      } catch (e) {
        if (missing(e)) return null;
        throw e;
      }
    },
    async exists(rel) {
      try {
        await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key(rel) }));
        return true;
      } catch (e) {
        if (missing(e)) return false;
        throw e;
      }
    },
  };
}

let store: ObjectStore | undefined;
// Chosen on first use so env files loaded by the caller (dotenv in the seed) are already applied.
const current = () => (store ??= process.env.S3_BUCKET_NAME ? s3Store(process.env.S3_BUCKET_NAME) : localStore());

export const putObject = (rel: string, body: Buffer, contentType: string) => current().put(rel, body, contentType);
export const getObject = (rel: string) => current().get(rel);
export const objectExists = (rel: string) => current().exists(rel);
