"use client";

import { useEffect } from "react";

import { isTypingTarget } from "@/lib/shortcuts";

/**
 * Keyboard operation for a list of task rows.
 *
 * One window listener rather than a handler per row. Rows come and go as tasks
 * are completed — the list is re-grouped on every optimistic change — so a
 * listener that lives with the list outlives the rows it acts on, and there is
 * exactly one place where a key means something.
 *
 * The listener re-subscribes whenever the rows or callbacks change. The first
 * version kept them in a ref written during render to attach once — which the
 * React compiler rejects, and rightly: a render-phase ref write is the same
 * hazard as any other side effect there. Swapping one window listener is a
 * couple of microseconds and renders only happen on interaction, so the
 * "optimisation" was buying nothing.
 */

export type RowKeyboard = {
  /** Visible task ids in render order, flattened across groups. */
  taskIds: readonly string[];
  focusedId: string | null;
  setFocusedId: (id: string | null) => void;
  onToggle: (id: string) => void;
  onOpenDetail: (id: string) => void;
  onStartRename: (id: string) => void;
  onDelete: (id: string) => void;
  /** Move the row one place within its own group. Null when not reorderable. */
  onReorder: ((id: string, delta: -1 | 1) => void) | null;
};

/** True when a task row, or something inside one, currently holds DOM focus. */
function rowHasFocus(): boolean {
  const active = document.activeElement;
  return active instanceof HTMLElement && active.closest("[data-task-row]") !== null;
}

/** A dialog takes the keyboard entirely; its own bindings are not ours. */
function dialogIsOpen(): boolean {
  return document.querySelector('[role="dialog"][data-state="open"]') !== null;
}

/**
 * The row keys must not fire when focus sits on a control *inside* a row — Space
 * on the checkbox is the checkbox's, not ours, and would otherwise toggle twice.
 */
function isInteractiveTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.closest("button, a, input, textarea, select, [role='checkbox']") !== null;
}

export function useRowKeyboard({
  taskIds,
  focusedId,
  setFocusedId,
  onToggle,
  onOpenDetail,
  onStartRename,
  onDelete,
  onReorder,
}: RowKeyboard) {
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (taskIds.length === 0) return;
      if (isTypingTarget(event.target) || dialogIsOpen()) return;

      const index = focusedId === null ? -1 : taskIds.indexOf(focusedId);

      /**
       * `j`/`k` move the cursor from anywhere and will create one if there is
       * none; the arrows only act once a row already holds focus.
       *
       * The first version took the arrows globally, which quietly broke
       * scrolling: pressing Down anywhere on a long list jumped the cursor
       * instead of moving the page, because the handler called
       * `preventDefault` whether or not the user was anywhere near the list.
       * Vim keys are never a scroll gesture, so they can safely be the way in.
       */
      const vimKey = event.key === "j" || event.key === "k";
      const arrowKey = event.key === "ArrowDown" || event.key === "ArrowUp";

      if (vimKey || arrowKey) {
        if (arrowKey && !rowHasFocus()) return;
        if (vimKey && (event.metaKey || event.ctrlKey || event.altKey)) return;
        const down = event.key === "ArrowDown" || event.key === "j";

        if (event.altKey) {
          // ⌥↑/⌥↓ reorders instead of moving. Only under manual sort, where the
          // stored order is what the eye is seeing.
          if (index === -1 || onReorder === null) return;
          event.preventDefault();
          onReorder(taskIds[index], down ? 1 : -1);
          return;
        }

        event.preventDefault();
        if (index === -1) {
          setFocusedId(down ? taskIds[0] : taskIds[taskIds.length - 1]);
          return;
        }
        // Clamped rather than wrapped: wrapping from the last row to the first
        // reads as a glitch when the list is longer than the screen.
        const next = Math.min(Math.max(index + (down ? 1 : -1), 0), taskIds.length - 1);
        setFocusedId(taskIds[next]);
        return;
      }

      if (index === -1 || isInteractiveTarget(event.target)) return;
      const id = taskIds[index];

      switch (event.key) {
        case " ":
          // Space scrolls the page by default, which is the opposite of helpful
          // when it is also the complete key.
          event.preventDefault();
          onToggle(id);
          break;
        case "Enter":
          event.preventDefault();
          onOpenDetail(id);
          break;
        case "e":
          event.preventDefault();
          onStartRename(id);
          break;
        case "Backspace":
        case "Delete":
          event.preventDefault();
          onDelete(id);
          break;
      }
    }

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    taskIds,
    focusedId,
    setFocusedId,
    onToggle,
    onOpenDetail,
    onStartRename,
    onDelete,
    onReorder,
  ]);
}

/**
 * Where focus goes when the focused row leaves the view.
 *
 * Completing a task removes its row, and the browser's answer to "what now" is
 * the document body — which strands a keyboard user at the top of the page and
 * tells a screen-reader user nothing. The next row down is the one they were
 * heading for anyway; the previous one if they were at the end.
 */
export function focusAfterRemoval(taskIds: readonly string[], removedId: string): string | null {
  const index = taskIds.indexOf(removedId);
  if (index === -1) return null;
  return taskIds[index + 1] ?? taskIds[index - 1] ?? null;
}
