"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

import { attempt } from "@/lib/actions/attempt";
import { setRepeat, skipOccurrence } from "@/lib/actions/task";
import { dayOfMonth, weekdayOf } from "@/lib/dates";
import { describeRepeat } from "@/lib/repeat";
import { repeatSchema, type Repeat, type RepeatKind } from "@/lib/schemas";

/**
 * The repeat rule, inside the detail panel.
 *
 * It holds its own state and writes through `setRepeat` rather than joining the
 * panel's React Hook Form. The plan had it RHF-resolved from the same schema;
 * the rule is a *discriminated union*, so a single form's values type would have
 * to be that union and every `register` path would depend on the selected kind.
 * That is real machinery for five fields, and the panel's own form submits a
 * flat payload. The schema is still the single definition — this validates with
 * `repeatSchema` before sending, exactly as the action does on arrival.
 *
 * Writes land on each committed change, like the label toggles beside it: a
 * second Save button inside a form that already has one is how people save the
 * wrong half of a panel.
 */

const KINDS: { value: RepeatKind | "none"; label: string }[] = [
  { value: "none", label: "Does not repeat" },
  { value: "daily", label: "Daily" },
  { value: "weekdays", label: "Every weekday" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "afterCompletion", label: "After completion" },
];

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];
const WEEKDAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

const INPUT =
  "rounded-cell border border-hair bg-card-paper px-2 py-1.5 text-[13.5px] text-ink outline-none focus-visible:border-blue";

/** A sensible rule for each kind, so picking one is immediately valid. */
function defaultFor(kind: RepeatKind, dueWeekday: number, dueDay: number): Repeat {
  switch (kind) {
    case "daily":
      return { kind: "daily", interval: 1 };
    case "weekdays":
      return { kind: "weekdays" };
    case "weekly":
      return { kind: "weekly", interval: 1, weekdays: [dueWeekday] };
    case "monthly":
      return { kind: "monthly", interval: 1, day: dueDay };
    case "afterCompletion":
      return { kind: "afterCompletion", days: 3 };
  }
}

export function RepeatEditor({
  taskId,
  repeat,
  dueDate,
  today,
}: {
  taskId: string;
  repeat: Repeat | null;
  /** A fixed rule advances from the due date, so without one it cannot repeat. */
  dueDate: string | null;
  today: string;
}) {
  const [rule, setRule] = useState<Repeat | null>(repeat);

  // A newly picked rule should default to the day the task already falls on.
  const anchor = dueDate ?? today;
  const [, startTransition] = useTransition();

  function save(next: Repeat | null) {
    const previous = rule;
    setRule(next);

    startTransition(async () => {
      const outcome = await attempt(
        () => setRepeat({ id: taskId, repeat: next }),
        "Could not save that repeat rule.",
      );
      if (outcome.status !== "ok" && outcome.status !== "slow") {
        setRule(previous);
        toast.error(outcome.message);
      }
    });
  }

  /** Only sends what the shared schema accepts — the action would reject the rest. */
  function commit(next: Repeat) {
    if (repeatSchema.safeParse(next).success) save(next);
    else setRule(next);
  }

  function changeKind(value: string) {
    if (value === "none") {
      save(null);
      return;
    }
    commit(defaultFor(value as RepeatKind, weekdayOf(anchor), dayOfMonth(anchor)));
  }

  function toggleWeekday(day: number) {
    if (rule?.kind !== "weekly") return;
    const weekdays = rule.weekdays.includes(day)
      ? rule.weekdays.filter((d) => d !== day)
      : [...rule.weekdays, day].sort((a, b) => a - b);
    // An empty set is not a rule. Held locally rather than sent, so the last day
    // can be unticked on the way to picking a different one.
    commit({ ...rule, weekdays } as Repeat);
  }

  /**
   * Skip is not a completion. It advances the same row, so nothing lands in
   * Completed — the point is that you did *not* do it this time.
   */
  function skip() {
    startTransition(async () => {
      const outcome = await attempt(
        () => skipOccurrence({ id: taskId }),
        "Could not skip that occurrence.",
      );
      if (outcome.status === "ok") toast.success("Skipped to the next occurrence.");
      else if (outcome.status !== "slow") toast.error(outcome.message);
    });
  }

  // An in-progress rule can be invalid: an emptied interval box is 0, and the
  // last weekday can be unticked on the way to picking another. Those are held
  // locally and not sent, so the editor must not describe them as if they were
  // real — "Every 0 days" is worse than an error.
  const valid = rule === null || repeatSchema.safeParse(rule).success;
  const needsDueDate = dueDate === null && rule !== null && rule.kind !== "afterCompletion";

  return (
    <div>
      <span className="text-ink-2 mb-1.5 block text-[12.5px] font-[650]">Repeat</span>

      <div className="flex flex-wrap items-center gap-2">
        <select
          value={rule?.kind ?? "none"}
          onChange={(e) => changeKind(e.target.value)}
          aria-label="Repeat"
          className={INPUT}
        >
          {KINDS.map((k) => (
            <option key={k.value} value={k.value}>
              {k.label}
            </option>
          ))}
        </select>

        {rule?.kind === "daily" && (
          <IntervalField
            label="days"
            value={rule.interval}
            onChange={(interval) => commit({ ...rule, interval })}
          />
        )}

        {rule?.kind === "weekly" && (
          <IntervalField
            label="weeks"
            value={rule.interval}
            onChange={(interval) => commit({ ...rule, interval })}
          />
        )}

        {rule?.kind === "monthly" && (
          <>
            <IntervalField
              label="months"
              value={rule.interval}
              onChange={(interval) => commit({ ...rule, interval })}
            />
            <label className="text-ink-2 flex items-center gap-1.5 text-[13px]">
              on day
              <input
                type="number"
                min={1}
                max={31}
                value={rule.day}
                onChange={(e) => commit({ ...rule, day: Number(e.target.value) })}
                aria-label="Day of the month"
                className={`${INPUT} w-16`}
              />
            </label>
          </>
        )}

        {rule?.kind === "afterCompletion" && (
          <IntervalField
            label="days after it is done"
            value={rule.days}
            onChange={(days) => commit({ ...rule, days })}
          />
        )}
      </div>

      {rule?.kind === "weekly" && (
        <div className="mt-2 flex gap-1">
          {WEEKDAYS.map((initial, day) => {
            const on = rule.weekdays.includes(day);
            return (
              <button
                key={day}
                type="button"
                onClick={() => toggleWeekday(day)}
                aria-pressed={on}
                aria-label={WEEKDAY_NAMES[day]}
                className={`size-7 rounded-full text-[12.5px] font-[650] transition-colors ${
                  on ? "bg-blue text-card-paper" : "bg-hover text-ink-2 hover:text-ink"
                }`}
              >
                {initial}
              </button>
            );
          })}
        </div>
      )}

      {rule !== null && valid && (
        <p className="text-ink-3 mt-2 text-[12.5px]">
          {describeRepeat(rule)}
          {rule.kind === "afterCompletion"
            ? " — counted from when you tick it, not from the due date."
            : " — the next one appears when you complete this one."}
        </p>
      )}

      {rule !== null && valid && !needsDueDate && (
        <button
          type="button"
          onClick={skip}
          className="text-blue hover:text-blue-hover mt-2 text-[12.5px] font-[550]"
        >
          Skip to the next one
        </button>
      )}

      {!valid && (
        <p role="alert" className="text-verm mt-2 text-[12.5px]">
          {rule?.kind === "weekly" && rule.weekdays.length === 0
            ? "Pick at least one day."
            : "That is not a number this can repeat on."}
        </p>
      )}

      {needsDueDate && (
        <p role="alert" className="text-verm mt-2 text-[12.5px]">
          This rule needs a due date to count from.
        </p>
      )}
    </div>
  );
}

function IntervalField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="text-ink-2 flex items-center gap-1.5 text-[13px]">
      every
      <input
        type="number"
        min={1}
        max={99}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label={`Repeat every how many ${label}`}
        className={`${INPUT} w-16`}
      />
      {label}
    </label>
  );
}
