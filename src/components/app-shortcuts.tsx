"use client";

import { useCallback, useEffect, useState } from "react";

import { CommandPalette } from "@/components/command-palette";
import { ShortcutsDialog } from "@/components/shortcuts-dialog";
import { isTypingTarget } from "@/lib/shortcuts";
import type { Label, List } from "@/lib/types";

/**
 * Hosts the palette and the shortcut list, and owns `?`.
 *
 * It exists so the two dialogs have one parent that can coordinate them — the
 * palette's "Keyboard shortcuts" item has to close the palette before opening
 * the other dialog, or the first dialog's focus trap is still active when the
 * second mounts and focus ends up on the body.
 */
export function AppShortcuts({ lists, labels }: { lists: List[]; labels: Label[] }) {
  const [shortcutsOpen, setShortcutsOpen] = useState(false);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key !== "?" || isTypingTarget(event.target)) return;
      event.preventDefault();
      setShortcutsOpen(true);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  /**
   * The capture box streams inside its own Suspense boundary while this sits in
   * the static shell, so there is no ref to share. One attribute lookup beats a
   * context provider spanning that boundary to move focus.
   */
  const focusCapture = useCallback(() => {
    const input = document.querySelector<HTMLInputElement>("[data-capture-input]");
    input?.focus();
    // `behavior` is a JS option, so the stylesheet's reduced-motion rule does
    // not reach it — the preference has to be read here too.
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    input?.scrollIntoView({ block: "center", behavior: reduced ? "auto" : "smooth" });
  }, []);

  const showShortcuts = useCallback(() => setShortcutsOpen(true), []);

  return (
    <>
      <CommandPalette
        lists={lists}
        labels={labels}
        onNewTask={focusCapture}
        onShowShortcuts={showShortcuts}
      />
      <ShortcutsDialog open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
    </>
  );
}
