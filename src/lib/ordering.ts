import { generateKeyBetween, generateNKeysBetween } from "fractional-indexing";

/**
 * Manual order, as sortable string keys.
 *
 * The property that matters: moving a row writes **one row**. Integer positions
 * would mean renumbering every sibling after the insertion point, which is a
 * write per task on every drag.
 *
 *   before   a="a0"   b="a1"   c="a2"
 *   drop c between a and b → "a0V"
 *   one UPDATE, no sibling touched
 *
 * The midpoint maths is delegated to `fractional-indexing` rather than written
 * here. It looks like string bisection and is not: the digit alphabet, key
 * length growth, and the boundary cases at either end of a list all have sharp
 * edges, and a subtly wrong implementation corrupts order rather than failing
 * loudly.
 */

/** A key before everything in the list. */
export function positionBefore(first: string | null): string {
  return generateKeyBetween(null, first);
}

/** A key after everything in the list — what a new task gets. */
export function positionAfter(last: string | null): string {
  return generateKeyBetween(last, null);
}

/**
 * A key that sorts between two neighbours. `null` means "the end of the list" on
 * that side, so dropping at the top passes `null` as `before`.
 */
export function positionBetween(before: string | null, after: string | null): string {
  return generateKeyBetween(before, after);
}

/** `count` keys after `last`, for inserting a pasted block in order. */
export function positionsAfter(last: string | null, count: number): string[] {
  return generateNKeysBetween(last, null, count);
}

/**
 * Where a row lands when dropped at `toIndex` in a list it is already part of.
 *
 * The subtlety: the neighbours are taken from the list *without* the moved row.
 * Using the original indices makes a one-place move compute a key between the
 * row and itself, which throws.
 */
export function positionForMove(
  positions: readonly string[],
  fromIndex: number,
  toIndex: number,
): string {
  const without = positions.filter((_, i) => i !== fromIndex);
  const before = toIndex > 0 ? (without[toIndex - 1] ?? null) : null;
  const after = without[toIndex] ?? null;
  return generateKeyBetween(before, after);
}
