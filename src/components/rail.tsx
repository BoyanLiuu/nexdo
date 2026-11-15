import {
  Archive,
  CalendarCheck,
  CalendarDays,
  Inbox,
  Plus,
  Search,
  SquareCheck,
} from "lucide-react";

import type { LucideIcon } from "lucide-react";

import { Brand } from "@/components/brand";
import { LIST_DOT } from "@/lib/colours";
import type { Label, List } from "@/lib/types";

/**
 * Views and lists. A visual shell in M0: every row is inert, because `/upcoming`,
 * `/inbox`, `/completed`, `/list/[id]` and `/label/[id]` do not exist until M3
 * and M4. Rendering them as links now would prefetch twelve 404s on first paint.
 * Each becomes a `<Link>` in the milestone that adds its route.
 *
 * All data arrives as props: the rail deliberately does not read the fixtures
 * itself, so M1 swaps one import in `page.tsx` and this file does not move.
 */

type ViewRow = {
  key: string;
  label: string;
  icon: LucideIcon;
  count?: number;
  /** Show a non-zero count in vermilion, as Today's overdue tally does. */
  alarming?: boolean;
};

const ROW =
  "flex h-9 items-center gap-2.5 rounded-cell px-2.5 text-[14.5px] font-[550] transition-colors";
const ROW_IDLE = "text-ink-2 hover:bg-rail-hover hover:text-ink";

function SectionHeading({ title, action }: { title: string; action: string }) {
  return (
    <div className="flex h-7 items-center justify-between pr-1 pb-1 pl-2.5">
      <h2 className="text-ink-2 text-[13px] font-[650]">{title}</h2>
      <button
        type="button"
        aria-label={action}
        className="text-ink-3 hover:bg-rail-hover hover:text-ink grid size-6 place-items-center rounded transition-colors"
      >
        <Plus className="size-4" strokeWidth={2} />
      </button>
    </div>
  );
}

export function Rail({
  lists,
  labels,
  counts,
}: {
  lists: List[];
  labels: Label[];
  counts: { overdueAndToday: number; inbox: number };
}) {
  const active = lists.filter((l) => !l.isArchived);
  const archivedCount = lists.length - active.length;

  const views: ViewRow[] = [
    {
      key: "today",
      label: "Today",
      icon: CalendarCheck,
      count: counts.overdueAndToday,
      alarming: true,
    },
    { key: "upcoming", label: "Upcoming", icon: CalendarDays },
    { key: "inbox", label: "Inbox", icon: Inbox, count: counts.inbox },
    { key: "completed", label: "Completed", icon: SquareCheck },
  ];

  return (
    <nav
      aria-label="Views and lists"
      className="w-rail border-rail-line bg-rail hidden shrink-0 flex-col overflow-y-auto border-r p-3 md:flex"
    >
      <Brand />

      <button
        type="button"
        className="rounded-cell border-hair bg-card-paper text-ink-3 hover:border-field-edge mb-1 flex h-9 items-center gap-2 border px-2.5 text-[14px] transition-colors"
      >
        <Search className="size-4" strokeWidth={1.9} />
        <span className="flex-1 text-left">Search</span>
        <kbd className="border-hair text-ink-3 rounded border px-1.5 font-sans text-[11px]">/</kbd>
      </button>

      <ul className="flex list-none flex-col gap-px">
        {views.map((view) => {
          const current = view.key === "today";
          return (
            <li key={view.key}>
              <div
                aria-current={current ? "page" : undefined}
                className={`${ROW} ${current ? "bg-card-paper text-ink shadow-item" : ROW_IDLE}`}
              >
                <view.icon className="text-ink-3 size-4 flex-none" strokeWidth={1.9} />
                <span className="flex-1 truncate">{view.label}</span>
                {view.count !== undefined && (
                  <span
                    className={`text-[13px] ${view.alarming && view.count > 0 ? "text-verm font-bold" : "text-ink-3"}`}
                  >
                    {view.count}
                  </span>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      <div className="mt-5">
        <SectionHeading title="Lists" action="New list" />
        <ul className="flex list-none flex-col gap-px">
          {active.map((list) => (
            <li key={list.id}>
              <div className={`${ROW} ${ROW_IDLE}`}>
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
              </div>
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
        <SectionHeading title="Labels" action="New label" />
        <ul className="flex list-none flex-col gap-px">
          {labels.map((label) => (
            <li key={label.id}>
              <div className={`${ROW} ${ROW_IDLE}`}>
                <span className="text-ink-3 w-4 flex-none text-center">@</span>
                <span className="flex-1 truncate">{label.name}</span>
              </div>
            </li>
          ))}
        </ul>
      </div>

      {/* The prototype's sync indicator sits here. It has no equivalent in this
          architecture; M7 puts the account and sign-in affordance in this slot. */}
      <div className="mt-auto pt-6" />
    </nav>
  );
}
