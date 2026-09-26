import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // src/lib/db-config.ts reads the RDS CA bundle at runtime by path, which file tracing can't see —
  // include it in every server function so serverless deploys (Vercel) ship it.
  outputFileTracingIncludes: {
    "/**": ["./certs/rds-global-bundle.pem"],
  },
};

export default nextConfig;
