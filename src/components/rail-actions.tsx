"use client";

import { useState, useTransition } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";

import { attempt } from "@/lib/actions/attempt";
import { createLabel, createList } from "@/lib/actions/list";
import { LIST_DOT } from "@/lib/colours";
import type { ListColour } from "@/lib/types";

/**
 * The `+` beside "Lists" and "Labels".
 *
 * One component for both because the interaction is identical — reveal an
 * input, type a name, Enter to create, Escape to cancel — and only the action
 * and the colour affordance differ. Two near-identical components would drift.
 */

const COLOURS: ListColour[] = [
  "sky",
  "grass",
  "orange",
  "rose",
  "violet",
  "teal",
  "olive",
  "brown",
  "slate",
];

/** Rotates so consecutive lists are visually distinct without asking. */
function nextColour(existing: number): ListColour {
  return COLOURS[existing % COLOURS.length];
}

export function AddToRail({
  kind,
  existingCount,
}: {
  kind: "list" | "label";
  existingCount: number;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [, startTransition] = useTransition();

  const colour = nextColour(existingCount);

  function submit() {
    // Sent for the same reason capture sends it: this may be the first write,
    // and the owner row it creates needs the right zone.
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const trimmed = name.trim();
    if (!trimmed) {
      setOpen(false);
      return;
    }
    setName("");
    setOpen(false);

    startTransition(async () => {
      const outcome = await attempt(
        () =>
          kind === "list"
            ? createList({ name: trimmed, colour, emoji: null, timeZone })
            : createLabel({ name: trimmed, colour, timeZone }),
        `Could not add that ${kind}.`,
      );
      if (outcome.status === "slow") toast.warning("Still saving.");
      else if (outcome.status !== "ok") toast.error(outcome.message);
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={kind === "list" ? "New list" : "New label"}
        className="text-ink-3 hover:bg-rail-hover hover:text-ink grid size-6 place-items-center rounded transition-colors"
      >
        <Plus className="size-4" strokeWidth={2} />
      </button>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="flex items-center gap-1.5"
    >
      {kind === "list" ? (
        <span aria-hidden className={`size-[11px] flex-none rounded-[3px] ${LIST_DOT[colour]}`} />
      ) : (
        <span aria-hidden className="text-ink-3 text-[13px]">
          @
        </span>
      )}
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={submit}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            setName("");
            setOpen(false);
          }
        }}
        placeholder={kind === "list" ? "List name" : "Label name"}
        aria-label={kind === "list" ? "New list name" : "New label name"}
        className="text-ink placeholder:text-ink-3 w-28 bg-transparent text-[13.5px] outline-none"
      />
    </form>
  );
}
