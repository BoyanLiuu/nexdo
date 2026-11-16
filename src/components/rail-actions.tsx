"use client";

import { useState, useTransition } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";

import { attempt } from "@/lib/actions/attempt";
import { createLabel, createList } from "@/lib/actions/list";
import { createId } from "@paralleldrive/cuid2";

import { LIST_DOT } from "@/lib/colours";
import { positionAfter } from "@/lib/ordering";
import type { Label, List, ListColour } from "@/lib/types";

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

/**
 * What this creates depends on the kind, so the callback is typed per kind
 * rather than as a union the caller has to narrow.
 */
type AddProps = { existingCount: number } & (
  | {
      kind: "list";
      onCreated: (created: List) => void;
      /** The last list's order key, so the new one sorts after it. */
      lastPosition: string | null;
    }
  | { kind: "label"; onCreated: (created: Label) => void }
);

export function AddToRail(props: AddProps) {
  const { kind, existingCount } = props;
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

    // Minted here, as task and subtask creation already do, so the row drawn
    // immediately is the row that gets stored — and navigating to it works
    // before the insert has landed, because its id is already final.
    const id = createId();
    // Labels are ordered by name, not by key, so only a list needs one.
    const position = props.kind === "list" ? positionAfter(props.lastPosition) : "";

    startTransition(async () => {
      // Inside the transition and before the await, which is what holds the
      // optimistic row until the action settles.
      if (props.kind === "list") {
        props.onCreated({ id, name: trimmed, colour, emoji: null, position, isArchived: false });
      } else {
        props.onCreated({ id, name: trimmed, colour });
      }

      const outcome = await attempt(
        () =>
          kind === "list"
            ? createList({ id, position, name: trimmed, colour, emoji: null, timeZone })
            : createLabel({ id, name: trimmed, colour, timeZone }),
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
