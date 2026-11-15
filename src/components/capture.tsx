"use client";

import { useRef, useState, useTransition } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";

import { createTasks } from "@/lib/actions/task";
import { attempt } from "@/lib/actions/attempt";

/**
 * The always-available capture box, directly under the view header inside the
 * sticky region so it stays reachable from anywhere in a long list.
 *
 * The input clears and keeps focus the moment you press Enter, rather than
 * waiting for the round trip — consecutive adds are the whole point, and a
 * capture box that blocks for 200ms per task is a capture box people stop using.
 * M2 adds the parsed-token chips beneath it.
 */
export function Capture({ dueDate }: { dueDate: string | null }) {
  const [value, setValue] = useState("");
  const [pending, startTransition] = useTransition();
  const input = useRef<HTMLInputElement>(null);

  function submit() {
    const title = value.trim();
    if (!title) return;

    // Cleared before the action resolves, so the next task can be typed
    // immediately. A failure re-fills the box rather than losing the text.
    setValue("");
    input.current?.focus();

    startTransition(async () => {
      const outcome = await attempt(
        () =>
          createTasks({
            title,
            dueDate,
            // Read per submit rather than at module load: this is also what gives
            // a brand-new guest's owner row its time zone.
            timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          }),
        "Could not add that task.",
      );

      if (outcome.status === "slow") {
        toast.warning("Still saving. Reload to see whether it was added.");
      } else if (outcome.status !== "ok") {
        // Put the text back rather than losing what they typed.
        setValue((v) => v || title);
        toast.error(outcome.message);
      }
    });
  }

  const lines = value.split("\n").filter((l) => l.trim()).length;

  return (
    <div className="relative mb-1.5">
      <div className="rounded-panel border-hair bg-card-paper shadow-item focus-within:border-field-edge border">
        <div className="grid h-13 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2.5 pr-2.5 pl-3.5">
          <Plus className="text-blue size-5" strokeWidth={2.2} />
          <input
            ref={input}
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                submit();
              }
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
            placeholder="Add a task"
            aria-label="Add a task"
            aria-busy={pending}
            className="text-ink caret-blue placeholder:text-ink-3 bg-transparent text-[15.5px] outline-none"
          />
          {lines > 1 ? (
            <span className="text-blue text-[12px] font-[650]">{lines} tasks</span>
          ) : (
            <kbd className="border-hair text-ink-3 hidden rounded border px-1.5 py-0.5 font-sans text-[11px] md:block">
              ↵
            </kbd>
          )}
        </div>
      </div>
    </div>
  );
}
