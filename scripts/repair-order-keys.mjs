import pg from "pg";
import { generateKeyBetween, generateNKeysBetween } from "fractional-indexing";

/**
 * Rewrite stored `position` values as real fractional-indexing keys.
 *
 * Why this exists: task positions were generated as `Date.now().toString(36)` —
 * values like `"mwis19a9"`. They sort correctly on their own, which is why
 * nothing looked wrong, but they are not fractional indices. Every attempt to
 * place a key *next to* one threw `invalid order key`, so dragging a task
 * failed and merging a guest's tasks into an existing account failed.
 *
 * The code no longer produces such keys, but rows already written still hold
 * them, and ordering stays broken for those rows until they are rewritten.
 *
 * Not a Prisma migration, because the new keys cannot be computed in SQL — they
 * come from the same library the application uses, which is the point: a
 * hand-rolled approximation in SQL is how you end up with a second subtly
 * different key format.
 *
 * Safe to run more than once. Rows whose keys are already valid are left
 * untouched, and ordering is preserved: rows are re-keyed in the order they
 * currently sort in, per owner, so nothing visibly moves.
 *
 *   node --env-file=.env scripts/repair-order-keys.mjs          # report only
 *   node --env-file=.env scripts/repair-order-keys.mjs --write  # apply
 */

const WRITE = process.argv.includes("--write");

function isOrderKey(value) {
  if (!value) return false;
  try {
    generateKeyBetween(value, null);
    return true;
  } catch {
    return false;
  }
}

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

try {
  let scanned = 0;
  let rewritten = 0;

  for (const table of ["tasks", "lists"]) {
    const { rows: owners } = await client.query(`SELECT DISTINCT owner_id FROM ${table}`);

    for (const { owner_id: ownerId } of owners) {
      // Ordered by the key they sort by today, so the visible order survives.
      const { rows } = await client.query(
        `SELECT id, position FROM ${table} WHERE owner_id = $1 ORDER BY position ASC`,
        [ownerId],
      );
      scanned += rows.length;

      // One bad key means the whole owner's set is re-keyed. Repairing only the
      // invalid ones would interleave two formats and leave the order to
      // chance, which is the situation this is here to end.
      if (rows.every((row) => isOrderKey(row.position))) continue;

      const keys = generateNKeysBetween(null, null, rows.length);
      for (const [i, row] of rows.entries()) {
        if (WRITE) {
          await client.query(`UPDATE ${table} SET position = $1 WHERE id = $2`, [keys[i], row.id]);
        }
        rewritten += 1;
      }
      console.log(
        `${WRITE ? "rewrote" : "would rewrite"} ${rows.length} ${table} for owner ${ownerId}`,
      );
    }
  }

  console.log(`\n${scanned} rows scanned, ${rewritten} ${WRITE ? "rewritten" : "needing repair"}.`);
  if (!WRITE && rewritten > 0) console.log("Re-run with --write to apply.");
} finally {
  await client.end();
}
