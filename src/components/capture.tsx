"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Plus, X } from "lucide-react";
import { toast } from "sonner";

import { attempt } from "@/lib/actions/attempt";
import { usePendingWriteGuard } from "@/lib/use-pending-write";
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
  list: "bg-hover text-ink",
  label: "bg-hover text-ink-2",
};

/** How long a submit will wait for the parser before saving without it. */
const PARSER_DEADLINE_MS = 2000;

async function raceParser(load: Promise<Chrono>): Promise<Chrono | undefined> {
  try {
    return await Promise.race([
      load,
      new Promise<undefined>((resolve) => setTimeout(() => resolve(undefined), PARSER_DEADLINE_MS)),
    ]);
  } catch {
    return undefined;
  }
}

export function Capture({
  today,
  defaultDueDate,
  lists = [],
  labels = [],
  defaultListId = null,
}: {
  /** The user's calendar date. Only a reference for chip labels. */
  today: string;
  /**
   * What an unparsed task gets. The current view's day, so a new task lands
   * where you are looking — or null in Inbox, which is for undated work.
   */
  defaultDueDate: string | null;
  /** Passed in so `#home` can resolve to an id without a round trip. */
  lists?: readonly { id: string; name: string }[];
  labels?: readonly { id: string; name: string }[];
  /** A list view files new tasks into itself unless the text says otherwise. */
  defaultListId?: string | null;
}) {
  const [value, setValue] = useState("");
  const [dismissed, setDismissed] = useState<ReadonlySet<string>>(new Set());
  const [pending, startTransition] = useTransition();
  const input = useRef<HTMLInputElement>(null);

  // The box clears before the task is saved, so there is nothing on screen to
  // tell the user a write is still in flight.
  usePendingWriteGuard(pending);

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
  const loadingChrono = useRef<Promise<Chrono>>(undefined);

  function loadChrono(): Promise<Chrono> {
    loadingChrono.current ??= import("chrono-node").then((m) => {
      setChrono(m);
      return m;
    });
    return loadingChrono.current;
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
    () => parseCapture(lines[0] ?? "", { today, chrono, dismissed, lists, labels }),
    [lines, today, chrono, dismissed, lists, labels],
  );

  function reset() {
    setValue("");
    setDismissed(new Set());
  }

  async function submit() {
    if (lines.length === 0) return;

    // Wait for the parser if it has not landed yet. The preview must never
    // block, but submitting must: typing "pay rent friday" and hitting Enter
    // within the import's few hundred milliseconds would otherwise silently
    // skip the date and file it under today.
    //
    // If the import fails outright, save anyway with the text as written. The
    // parser is an enhancement; losing the task because a chunk failed to fetch
    // would be far worse than filing it undated.
    // Bounded on purpose. Waiting for the parser stops a fast typist losing
    // "friday"; waiting *indefinitely* would mean a slow or failed chunk fetch
    // blocks saving altogether, which is far worse. Past the deadline the task
    // is saved as written — undated rather than lost.
    const parser = chrono ?? (await raceParser(loadChrono()));

    const tasks: NewTask[] = lines.map((line) => {
      const parsed = parseCapture(line, { today, chrono: parser, dismissed, lists, labels });
      return {
        // A line that was *entirely* tokens still needs a title; fall back to
        // the raw line rather than saving an empty task.
        title: parsed.title || line.trim(),
        // Falls back to the view's own day, so a new task appears where you are
        // looking rather than silently somewhere else.
        dueDate: parsed.dueDate ?? defaultDueDate,
        dueTime: parsed.dueTime,
        priority: parsed.priority,
        listId: parsed.listId ?? defaultListId ?? null,
        labelIds: parsed.labelIds,
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
                void submit();
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
