import "dotenv/config";
import { defineConfig, env } from "prisma/config";

/**
 * Prisma 7 moved connection URLs out of schema.prisma, and dropped `directUrl`
 * — the CLI now takes a single `datasource.url`.
 *
 * That URL must be DIRECT_URL (the session pooler, port 5432), not DATABASE_URL:
 * `prisma migrate` cannot run over transaction-mode pooling, which is what
 * DATABASE_URL points at. DATABASE_URL is used at runtime instead, by the pg
 * driver adapter in src/lib/server/prisma.ts.
 */
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: env("DIRECT_URL"),
  },
});
