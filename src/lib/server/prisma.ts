import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "@/generated/prisma/client";

/**
 * The only database handle in the app. Server-only: nothing in `components/`
 * imports this, and the browser never talks to Postgres or Supabase directly.
 *
 * `DATABASE_URL` here is the runtime connection. Migrations use `DIRECT_URL`
 * via prisma.config.ts instead — see that file for why they differ.
 */
/**
 * Connections this process may hold.
 *
 * `pg` defaults to 10, which is too many: Supabase's pooler allows 15 for the
 * whole project, so two server processes together ask for 20 and every query
 * starts failing with `(EMAXCONNSESSION) max clients reached`. The app still
 * renders — it is a static shell — while every piece of data inside it is
 * missing, so it reads as a UI bug rather than a database one.
 *
 * The budget is per *process*, and the number of processes is not one: Next
 * runs several render workers, each evaluating this module and opening its own
 * pool. Measured against the 15-slot pooler, a cap of 6 still exhausted it and
 * 2 did not — so the real constraint is `workers x max < 15`, not `max < 15`.
 *
 * Three is the compromise. Lower would serialise `viewChrome`'s six-query
 * `Promise.all` into more round trips than necessary; higher stops two server
 * processes running at once. Overridable because the right number depends on the
 * deployment: on the transaction pooler each serverless instance wants very few,
 * and the project limit is much higher.
 */
const MAX_CONNECTIONS = Number(process.env.DATABASE_POOL_MAX ?? 3);

function createClient() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    // pg silently falls back to its own defaults when this is unset, which
    // surfaces much later as a confusing SASL error.
    throw new Error("DATABASE_URL is not set. Copy .env.example to .env.");
  }
  return new PrismaClient({
    adapter: new PrismaPg({ connectionString, max: MAX_CONNECTIONS }),
  });
}

// Next's dev server re-evaluates modules on every edit. Without this, each hot
// reload leaks a connection pool until the database refuses new connections.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
