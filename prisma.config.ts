import "dotenv/config";
import { defineConfig } from "prisma/config";
import { databaseUrl, isRdsHost } from "./src/lib/db-config";

// Migrations run through Prisma's schema engine, not the pg adapter (src/lib/db-config.ts), so they don't get its
// CA verification. RDS refuses unencrypted connections; default them to sslmode=require (encrypted, unverified).
function migrationUrl() {
  const url = databaseUrl();
  if (!isRdsHost(url) || /[?&]sslmode=/.test(url)) return url;
  return url + (url.includes("?") ? "&" : "?") + "sslmode=require";
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: migrationUrl(),
  },
});
