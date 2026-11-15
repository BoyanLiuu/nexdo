"use client";

import { useRef, useState } from "react";

/**
 * Swipe a row sideways to complete it, on touch devices.
 *
 * The hard part is not the gesture, it is not stealing the page's scroll. A row
 * is in a vertical list, so most touches that start on one are the user
 * scrolling past it. The rule here: the first few pixels decide. Until the
 * finger has moved far enough to have a direction, nothing happens; once it is
 * clearly more horizontal than vertical, the swipe takes over and the row
 * follows the finger. If it is more vertical, the gesture is abandoned for the
 * rest of that touch and the browser scrolls normally.
 *
 * Deliberately no `preventDefault` on touchmove until the direction is settled.
 * Calling it earlier is the usual way swipe implementations break scrolling.
 */

/** Movement before a direction is assumed, in CSS pixels. */
const DIRECTION_THRESHOLD = 10;
/** How far the row must travel for the swipe to count as a completion. */
const COMMIT_DISTANCE = 72;

type Axis = "undecided" | "horizontal" | "abandoned";

export function useSwipeComplete(onComplete: () => void) {
  const start = useRef<{ x: number; y: number } | null>(null);
  const axis = useRef<Axis>("undecided");
  /**
   * The authoritative distance, kept in a ref as well as in state.
   *
   * `onTouchEnd` has to decide whether the swipe committed, and reading that
   * from state means reading the value React had at the last *render*. Touch
   * events arrive faster than renders flush, so a finger that visibly reached
   * 100px could be judged on a stale 60 and the completion would silently not
   * happen. State drives the transform; the ref decides the outcome.
   */
  const travelled = useRef(0);
  const [offset, setOffset] = useState(0);

  function onTouchStart(event: React.TouchEvent) {
    const touch = event.touches[0];
    start.current = { x: touch.clientX, y: touch.clientY };
    axis.current = "undecided";
    travelled.current = 0;
  }

  function onTouchMove(event: React.TouchEvent) {
    if (!start.current || axis.current === "abandoned") return;

    // A second finger means a pinch or a two-finger scroll, not a row swipe.
    if (event.touches.length > 1) {
      axis.current = "abandoned";
      travelled.current = 0;
      setOffset(0);
      return;
    }

    const touch = event.touches[0];
    const dx = touch.clientX - start.current.x;
    const dy = touch.clientY - start.current.y;

    if (axis.current === "undecided") {
      if (Math.abs(dx) < DIRECTION_THRESHOLD && Math.abs(dy) < DIRECTION_THRESHOLD) return;
      // Ties go to scrolling: a list is read far more often than it is swiped.
      axis.current = Math.abs(dx) > Math.abs(dy) ? "horizontal" : "abandoned";
      if (axis.current === "abandoned") return;
    }

    // Right only. A left swipe is reserved — delete by accident is unforgivable
    // where complete by accident costs one tap of Undo.
    const distance = Math.max(0, dx);
    travelled.current = distance;
    setOffset(distance);
  }

  function onTouchEnd() {
    const distance = travelled.current;
    start.current = null;
    axis.current = "undecided";
    travelled.current = 0;
    setOffset(0);
    if (distance >= COMMIT_DISTANCE) onComplete();
  }

  return {
    /** Spread onto the row. */
    handlers: { onTouchStart, onTouchMove, onTouchEnd, onTouchCancel: onTouchEnd },
    /** How far the row has been dragged, for the transform and the hint. */
    offset,
    /** Past the point where letting go completes it. */
    willComplete: offset >= COMMIT_DISTANCE,
  };
}
