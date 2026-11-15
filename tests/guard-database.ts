import "dotenv/config";
import pg from "pg";

/**
 * Refuse to run the end-to-end suite against a database that holds real
 * accounts.
 *
 * These tests write: every run creates tasks and mints a guest owner. That is
 * fine against a dev project and unacceptable against production — and the only
 * thing standing between the two is whatever `DATABASE_URL` happens to say.
 * Pointing `.env` at production becomes tempting around deployment, which is
 * exactly when a mistake is least recoverable.
 *
 * The signal is a signed-in account. A dev database has only `GUEST` owners; the
 * moment one `USER` owner exists, something real lives there. That needs no new
 * configuration and starts working precisely when it matters — once Clerk lands
 * in M7 and real accounts exist.
 *
 * Set `E2E_ALLOW_REAL_ACCOUNTS=1` to override, deliberately and visibly.
 */
export default async function guardDatabase() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set. Copy .env.example to .env before running e2e.");
  }

  if (process.env.E2E_ALLOW_REAL_ACCOUNTS === "1") {
    console.warn("⚠ e2e database guard overridden by E2E_ALLOW_REAL_ACCOUNTS=1");
    return;
  }

  const client = new pg.Client({ connectionString });
  await client.connect();
  try {
    const { rows } = await client.query<{ n: number }>(
      `select count(*)::int as n from owners where kind = 'USER'`,
    );
    const accounts = rows[0]?.n ?? 0;
    if (accounts > 0) {
      throw new Error(
        `Refusing to run e2e: this database has ${accounts} signed-in account(s), so it is not a ` +
          `test database. These tests create tasks and guest owners.\n` +
          `Point DATABASE_URL at the dev Supabase project, or set ` +
          `E2E_ALLOW_REAL_ACCOUNTS=1 if you genuinely mean it.`,
      );
    }
  } finally {
    await client.end();
  }
}
