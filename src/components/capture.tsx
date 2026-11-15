"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Plus, X } from "lucide-react";
import { toast } from "sonner";

import { attempt } from "@/lib/actions/attempt";
import { createTasks } from "@/lib/actions/task";
import { parseCapture, type Chip, type Chrono } from "@/lib/parse";
import type { NewTask } from "@/lib/schemas";

/**
 * The always-available capture box: one line of text becomes a dated,
 * prioritised task, and you see what it read before it saves.
 *
 * The chips are the whole safety model. `chrono` guesses, and sometimes guesses
 * wrong — showing the guess before Enter turns a silent mistake into a visible
 * one that costs a click.
 */

const CHIP_TONE: Record<Chip["kind"], string> = {
  date: "bg-blue-tint text-ink",
  time: "bg-blue-tint text-ink",
  priority: "bg-marigold-tint text-marigold-ink",
};

export function Capture({ today }: { today: string }) {
  const [value, setValue] = useState("");
  const [dismissed, setDismissed] = useState<ReadonlySet<string>>(new Set());
  const [pending, startTransition] = useTransition();
  const input = useRef<HTMLInputElement>(null);

  /**
   * `chrono` is the heaviest dependency in the project and most page views never
   * type anything, so it is fetched on the first keystroke rather than bundled
   * into the initial payload. Priority parsing works without it, so the first
   * character is never dead while it loads.
   *
   * Loaded from the change handler rather than an effect: typing is an
   * interaction, not derived state, and an effect keyed on `value` would re-run
   * on every character only to hit its own guard.
   */
  const [chrono, setChrono] = useState<Chrono>();
  const loading = useRef(false);

  function loadChrono() {
    if (loading.current) return;
    loading.current = true;
    import("chrono-node").then(setChrono);
  }

  // Press N from anywhere to start typing.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "n" || e.metaKey || e.ctrlKey || e.altKey) return;
      const el = document.activeElement;
      // Don't steal the key from a field the user is already typing in.
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) return;
      e.preventDefault();
      input.current?.focus();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const lines = useMemo(() => value.split("\n").filter((l) => l.trim()), [value]);

  /**
   * Chips are shown for a single line only. A pasted block still parses — every
   * line gets its own date and priority on submit — but previewing twenty sets
   * of chips at once would be noise rather than reassurance.
   */
  const preview = useMemo(
    () => parseCapture(lines[0] ?? "", { today, chrono, dismissed }),
    [lines, today, chrono, dismissed],
  );

  function reset() {
    setValue("");
    setDismissed(new Set());
  }

  function submit() {
    if (lines.length === 0) return;

    const tasks: NewTask[] = lines.map((line) => {
      const parsed = parseCapture(line, { today, chrono, dismissed });
      return {
        // A line that was *entirely* tokens still needs a title; fall back to
        // the raw line rather than saving an empty task.
        title: parsed.title || line.trim(),
        // Undated capture on Today lands on Today, so it appears in the view
        // you are looking at rather than silently in Inbox.
        dueDate: parsed.dueDate ?? today,
        dueTime: parsed.dueTime,
        priority: parsed.priority,
      };
    });

    const restore = value;
    // Cleared before the action resolves so the next task can be typed at once.
    reset();
    input.current?.focus();

    startTransition(async () => {
      const outcome = await attempt(
        () => createTasks({ tasks, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone }),
        "Could not add that task.",
      );

      if (outcome.status === "slow") {
        toast.warning("Still saving. Reload to see whether it was added.");
      } else if (outcome.status !== "ok") {
        // Put the text back rather than losing what they typed.
        setValue((v) => v || restore);
        toast.error(outcome.message);
      }
    });
  }

  return (
    <div className="relative mb-1.5">
      <div className="rounded-panel border-hair bg-card-paper shadow-item focus-within:border-field-edge border">
        <div className="grid h-13 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2.5 pr-2.5 pl-3.5">
          <Plus className="text-blue size-5" strokeWidth={2.2} />
          <input
            ref={input}
            type="text"
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              loadChrono();
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                submit();
              }
              if (e.key === "Escape") reset();
            }}
            onPaste={(e) => {
              const text = e.clipboardData.getData("text");
              // Multi-line paste means several tasks, so keep the newlines
              // instead of letting the input flatten them into one title.
              if (text.includes("\n")) {
                e.preventDefault();
                setValue((v) => (v ? `${v}\n${text}` : text));
              }
            }}
            autoComplete="off"
            spellCheck={false}
            placeholder="Add a task — try “pay rent friday p1”"
            aria-label="Add a task"
            aria-busy={pending}
            aria-describedby="capture-read"
            className="text-ink caret-blue placeholder:text-ink-3 bg-transparent text-[15.5px] outline-none"
          />
          {lines.length > 1 ? (
            <span className="text-blue text-[12px] font-[650]">{lines.length} tasks</span>
          ) : (
            <kbd className="border-hair text-ink-3 hidden rounded border px-1.5 py-0.5 font-sans text-[11px] md:block">
              ↵
            </kbd>
          )}
        </div>

        {lines.length === 1 && preview.chips.length > 0 ? (
          <div className="flex flex-wrap gap-1.5 pr-3 pb-2.5 pl-[42px]">
            {preview.chips.map((chip) => (
              <span
                key={chip.id}
                className={`rounded-cell inline-flex h-7 items-center gap-1 pr-1 pl-2 text-[13px] font-[550] ${CHIP_TONE[chip.kind]}`}
              >
                {chip.label}
                <button
                  type="button"
                  onClick={() => setDismissed((d) => new Set(d).add(chip.id))}
                  aria-label={`Don't apply ${chip.label}`}
                  className="text-ink-2 hover:text-ink grid size-5 place-items-center rounded hover:bg-black/8"
                >
                  <X className="size-3.5" strokeWidth={2.4} />
                </button>
              </span>
            ))}
          </div>
        ) : null}
      </div>

      {/* Announced to screen readers, since the chips are the only signal that
          the text was interpreted rather than taken literally. */}
      <p id="capture-read" aria-live="polite" className="sr-only">
        {lines.length === 1 && preview.chips.length > 0
          ? `Will save as “${preview.title}” with ${preview.chips.map((c) => c.label).join(", ")}`
          : ""}
      </p>
    </div>
  );
}
