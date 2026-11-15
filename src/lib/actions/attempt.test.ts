import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { attempt } from "@/lib/actions/attempt";

/**
 * These four cases are why `attempt` exists. Each was reachable in practice and
 * only the first is obvious.
 *
 * Note they are tested here rather than end-to-end: stopping the dev server
 * mid-click does not produce a clean failure — the browser queues the request
 * and it can land minutes later when the server returns. That makes a
 * browser-level "offline" test unreliable, which is precisely the behaviour the
 * `slow` outcome exists to describe.
 */
describe("attempt", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("reports success when the action returns ok", async () => {
    const outcome = await attempt(async () => ({ ok: true }), "nope");
    expect(outcome).toEqual({ status: "ok" });
  });

  it("surfaces the action's own message when it declines", async () => {
    const outcome = await attempt(
      async () => ({ ok: false, message: "A task needs a title." }),
      "nope",
    );
    expect(outcome).toEqual({ status: "rejected", message: "A task needs a title." });
  });

  it("falls back when the action declines without a message", async () => {
    const outcome = await attempt(async () => undefined, "Could not save.");
    expect(outcome).toEqual({ status: "rejected", message: "Could not save." });
  });

  it("reports an error when the action throws", async () => {
    const outcome = await attempt(async () => {
      throw new Error("boom");
    }, "Could not save.");
    expect(outcome).toEqual({ status: "error", message: "Could not save." });
  });

  it("reports slow — not failure — when the call never settles", async () => {
    const pending = attempt(() => new Promise(() => {}), "Could not save.");
    await vi.advanceTimersByTimeAsync(8000);
    // Deliberately not `error`: an unsettled request may still land, so
    // claiming failure would be as wrong as claiming success.
    expect(await pending).toEqual({ status: "slow" });
  });

  it("does not report slow for a call that settles in time", async () => {
    const pending = attempt(
      () => new Promise((resolve) => setTimeout(() => resolve({ ok: true }), 2000)),
      "Could not save.",
    );
    await vi.advanceTimersByTimeAsync(2000);
    expect(await pending).toEqual({ status: "ok" });
  });
});
