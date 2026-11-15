import { type ActionResult } from "@/lib/actions/result";

/** Past this, the user deserves to be told something is wrong. */
const SLOW_MS = 8000;

export type Outcome =
  | { status: "ok" }
  /** The action ran and declined — validation, authorization. Final. */
  | { status: "rejected"; message: string }
  /** The action threw. Final. */
  | { status: "error"; message: string }
  /**
   * Still unsettled after SLOW_MS. Deliberately NOT reported as a failure: a
   * request that has not come back may still land. Killing the dev server
   * mid-click and watching the write arrive minutes later once it restarted is
   * how this distinction was found — the browser had queued the request, not
   * dropped it. Claiming "could not save" there would be as wrong as claiming
   * success.
   */
  | { status: "slow" };

/**
 * Call a Server Action and describe what happened.
 *
 * Three shapes have to be handled, and only the first is obvious:
 *
 *   1. It returned `{ ok: false }` — an expected refusal.
 *   2. It threw — an unexpected server error.
 *   3. It never settled. With the server unreachable the promise Next hands
 *      back can stay pending for minutes. That is the dangerous one: an
 *      unsettled promise keeps the surrounding transition open, so
 *      `useOptimistic` never rolls back and the UI sits showing a change whose
 *      fate is unknown.
 *
 * Resolving on the slow path ends the transition, which lets React discard the
 * optimistic state — so the row reverts and the user is told, rather than being
 * left looking at a lie.
 */
export async function attempt(
  call: () => Promise<unknown>,
  errorMessage: string,
): Promise<Outcome> {
  let timer: ReturnType<typeof setTimeout> | undefined;

  try {
    const result = await Promise.race([
      call(),
      new Promise<typeof SLOW>((resolve) => {
        timer = setTimeout(() => resolve(SLOW), SLOW_MS);
      }),
    ]);

    if (result === SLOW) return { status: "slow" };

    const action = result as ActionResult | undefined;
    if (action?.ok) return { status: "ok" };
    // `undefined` means the call came back malformed or never reached the server.
    return { status: "rejected", message: action?.message ?? errorMessage };
  } catch {
    return { status: "error", message: errorMessage };
  } finally {
    clearTimeout(timer);
  }
}

const SLOW = Symbol("slow");
