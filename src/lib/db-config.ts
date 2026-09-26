import { readFileSync } from "node:fs";
import path from "node:path";
import type { PoolConfig } from "pg";

/**
 * pg pool options for the database URL (see databaseUrl), shared by the app and the seed script.
 * Amazon RDS certificates are issued by Amazon's own CAs, which Node does not trust, so RDS hosts are
 * verified against certs/rds-global-bundle.pem (https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem)
 * instead of relying on a plain sslmode=require. Other hosts (local Docker) connect as the URL says.
 */
const RDS_CA = path.join(/*turbopackIgnore: true*/ process.cwd(), "certs", "rds-global-bundle.pem");
const URL_SSL_PARAMS = ["ssl", "sslmode", "sslrootcert", "sslcert", "sslkey", "sslpassword", "sslaccept", "uselibpqcompat"];

export const isRdsHost = (connectionString: string) =>
  /\.rds\.amazonaws\.com(\.cn)?$/i.test(new URL(connectionString).hostname);

/** DATABASE_URL, or one built from DB_HOST/DB_PORT/DB_NAME/DB_USER/DB_PASSWORD (the marketing site's variables). */
export function databaseUrl(): string {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const { DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD } = process.env;
  if (!DB_HOST) throw new Error("Set DATABASE_URL, or DB_HOST with DB_NAME/DB_USER/DB_PASSWORD");
  const auth = DB_USER ? `${encodeURIComponent(DB_USER)}${DB_PASSWORD ? `:${encodeURIComponent(DB_PASSWORD)}` : ""}@` : "";
  return `postgresql://${auth}${DB_HOST}:${DB_PORT || 5432}/${encodeURIComponent(DB_NAME ?? "")}`;
}

export function pgPoolConfig(connectionString = databaseUrl()): PoolConfig {
  if (!isRdsHost(connectionString)) return { connectionString };

  // SSL params in the URL would override `ssl` below, so the CA bundle takes their place.
  const url = new URL(connectionString);
  for (const p of URL_SSL_PARAMS) url.searchParams.delete(p);
  let ca: Buffer;
  try {
    ca = readFileSync(/*turbopackIgnore: true*/ RDS_CA);
  } catch {
    throw new Error(`RDS CA bundle missing at ${RDS_CA} — deploy the certs/ folder with the app.`);
  }
  return { connectionString: url.toString(), ssl: { ca, rejectUnauthorized: true } };
}
