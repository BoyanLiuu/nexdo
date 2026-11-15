import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "@/generated/prisma/client";

/**
 * The only database handle in the app. Server-only: nothing in `components/`
 * imports this, and the browser never talks to Postgres or Supabase directly.
 *
 * `DATABASE_URL` here is the runtime connection. Migrations use `DIRECT_URL`
 * via prisma.config.ts instead — see that file for why they differ.
 */
function createClient() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    // pg silently falls back to its own defaults when this is unset, which
    // surfaces much later as a confusing SASL error.
    throw new Error("DATABASE_URL is not set. Copy .env.example to .env.");
  }
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}

// Next's dev server re-evaluates modules on every edit. Without this, each hot
// reload leaks a connection pool until the database refuses new connections.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
