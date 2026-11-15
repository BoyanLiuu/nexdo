"use client";

import { useEffect } from "react";

/**
 * Warn before leaving while a write is still in flight.
 *
 * Optimistic UI means the screen reports success before the server has
 * confirmed it: a row vanishes the instant you tick it, and the action follows.
 * Close the tab inside that window and the browser cancels the request — the
 * task stays open in the database while the user watched it being completed.
 *
 * The window is short, usually under 200ms. But it is real, and it surfaces as
 * "the app lost my task" with no reproduction, which is the worst kind of bug to
 * be handed. This is the same race the e2e tests hit when they navigated
 * straight after an optimistic change.
 *
 * `beforeunload` is crude — the browser picks the wording, and it only fires
 * after the user has interacted with the page. Both are fine here: a user who
 * just ticked a checkbox has interacted, and any wording that causes a pause is
 * better than a silent loss.
 */
export function usePendingWriteGuard(pending: boolean): void {
  useEffect(() => {
    if (!pending) return;

    function warn(event: BeforeUnloadEvent) {
      event.preventDefault();
    }

    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [pending]);
}
