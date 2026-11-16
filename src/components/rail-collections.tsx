"use client";

import { useOptimistic } from "react";
import Link from "next/link";
import { Archive } from "lucide-react";

import { AddToRail } from "@/components/rail-actions";
import { ROW, ROW_CURRENT, ROW_IDLE } from "@/components/rail-row";
import { LIST_DOT } from "@/lib/colours";
import type { Label, List } from "@/lib/types";
import type { ViewKey } from "@/components/rail";

/**
 * The Lists and Labels halves of the rail.
 *
 * A client component for one reason: `useOptimistic`. A new list used to take a
 * round trip to appear — the add button lived here but the arrays came from the
 * server, so there was nowhere to put the row. Same shape of problem the capture
 * box had, and the same answer: the thing that creates and the thing that owns
 * the list have to meet in one client component.
 *
 * Both sections are in one component rather than two because they are adjacent
 * and each needs the same treatment; splitting them would mean two boundaries
 * and two copies of the plumbing.
 */
export function RailCollections({
  lists,
  labels,
  current,
  currentId,
}: {
  lists: List[];
  labels: Label[];
  current: ViewKey;
  currentId?: string;
}) {
  const [optimisticLists, addList] = useOptimistic(lists, (current: List[], added: List) =>
    [...current, added].sort((a, b) => (a.position < b.position ? -1 : 1)),
  );
  const [optimisticLabels, addLabel] = useOptimistic(labels, (current: Label[], added: Label) =>
    // Labels have no position; the rail shows them by name, as the query does.
    [...current, added].sort((a, b) => a.name.localeCompare(b.name)),
  );

  const active = optimisticLists.filter((list) => !list.isArchived);
  const archivedCount = optimisticLists.length - active.length;

  return (
    <>
      <div className="mt-5">
        <SectionHeading
          title="Lists"
          kind="list"
          existingCount={optimisticLists.length}
          onCreated={addList}
          lastPosition={optimisticLists.at(-1)?.position ?? null}
        />
        <ul className="flex list-none flex-col gap-px">
          {active.map((list) => (
            <li key={list.id}>
              <Link
                href={`/list/${list.id}`}
                aria-current={current === "list" && currentId === list.id ? "page" : undefined}
                className={`${ROW} ${current === "list" && currentId === list.id ? ROW_CURRENT : ROW_IDLE}`}
              >
                {list.emoji ? (
                  <span className="w-4 flex-none text-center text-[13px] leading-none">
                    {list.emoji}
                  </span>
                ) : (
                  <span
                    className={`size-[11px] flex-none rounded-[3px] ${LIST_DOT[list.colour]}`}
                  />
                )}
                <span className="flex-1 truncate">{list.name}</span>
              </Link>
            </li>
          ))}
        </ul>
        {archivedCount > 0 && (
          <div className="text-ink-3 mt-1 flex h-8 items-center gap-2 px-2.5 text-[13px]">
            <Archive className="size-3.5" strokeWidth={1.9} />
            Archived · {archivedCount}
          </div>
        )}
      </div>

      <div className="mt-5">
        <SectionHeading
          title="Labels"
          kind="label"
          existingCount={optimisticLabels.length}
          onCreated={addLabel}
        />
        <ul className="flex list-none flex-col gap-px">
          {optimisticLabels.map((label) => (
            <li key={label.id}>
              <Link
                href={`/label/${label.id}`}
                aria-current={current === "label" && currentId === label.id ? "page" : undefined}
                className={`${ROW} ${current === "label" && currentId === label.id ? ROW_CURRENT : ROW_IDLE}`}
              >
                <span className="text-ink-3 w-4 flex-none text-center">@</span>
                <span className="flex-1 truncate">{label.name}</span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}

/**
 * A discriminated union rather than `kind: "list" | "label"` with a loose
 * callback: what gets created depends on the kind, and typing it as the union
 * of both would push a cast into the caller.
 */
type SectionProps = { title: string; existingCount: number } & (
  | { kind: "list"; onCreated: (created: List) => void; lastPosition: string | null }
  | { kind: "label"; onCreated: (created: Label) => void }
);

function SectionHeading({ title, existingCount, ...rest }: SectionProps) {
  return (
    <div className="mb-1 flex h-7 items-center justify-between px-2.5">
      <h2 className="text-ink-3 text-[12px] font-[650] tracking-[0.04em] uppercase">{title}</h2>
      <AddToRail existingCount={existingCount} {...rest} />
    </div>
  );
}
