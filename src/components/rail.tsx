import Link from "next/link";
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
 * Views and lists.
 *
 * The view rows became real links in M3, when their routes started existing.
 * List and label rows are still inert — `/list/[id]` and `/label/[id]` arrive in
 * M4, and as links they would prefetch 404s on first paint.
 *
 * All data arrives as props, so the route decides what to fetch and this file
 * does not move when the source changes.
 */

export type ViewKey = "today" | "upcoming" | "inbox" | "completed";

export type RailCounts = { due: number; inbox: number; upcoming: number; completed: number };

type ViewRow = {
  key: ViewKey;
  href: string;
  label: string;
  icon: LucideIcon;
  count?: number;
  /** Render a non-zero count in vermilion, as Today's overdue tally does. */
  alarming?: boolean;
};

const ROW =
  "flex h-9 items-center gap-2.5 rounded-cell px-2.5 text-[14.5px] font-[550] transition-colors";
const ROW_IDLE = "text-ink-2 hover:bg-rail-hover hover:text-ink";
const ROW_CURRENT = "bg-card-paper text-ink shadow-item";

function views(counts: RailCounts): ViewRow[] {
  return [
    {
      key: "today",
      href: "/",
      label: "Today",
      icon: CalendarCheck,
      count: counts.due,
      alarming: true,
    },
    {
      key: "upcoming",
      href: "/upcoming",
      label: "Upcoming",
      icon: CalendarDays,
      count: counts.upcoming,
    },
    { key: "inbox", href: "/inbox", label: "Inbox", icon: Inbox, count: counts.inbox },
    {
      key: "completed",
      href: "/completed",
      label: "Completed",
      icon: SquareCheck,
      count: counts.completed,
    },
  ];
}

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

function Frame({ children }: { children: React.ReactNode }) {
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
      {children}
    </nav>
  );
}

/**
 * The rail with no data yet: the view rows are still navigable, which is the
 * point — the shell is usable before any query resolves.
 */
export function RailFallback({ current }: { current: ViewKey }) {
  return (
    <Frame>
      <ul className="flex list-none flex-col gap-px">
        {views({ due: 0, inbox: 0, upcoming: 0, completed: 0 }).map((view) => (
          <li key={view.key}>
            <Link
              href={view.href}
              aria-current={view.key === current ? "page" : undefined}
              className={`${ROW} ${view.key === current ? ROW_CURRENT : ROW_IDLE}`}
            >
              <view.icon className="text-ink-3 size-4 flex-none" strokeWidth={1.9} />
              <span className="flex-1 truncate">{view.label}</span>
            </Link>
          </li>
        ))}
      </ul>
    </Frame>
  );
}

export function Rail({
  current,
  lists,
  labels,
  counts,
}: {
  current: ViewKey;
  lists: List[];
  labels: Label[];
  counts: RailCounts;
}) {
  const active = lists.filter((l) => !l.isArchived);
  const archivedCount = lists.length - active.length;

  return (
    <Frame>
      <ul className="flex list-none flex-col gap-px">
        {views(counts).map((view) => {
          const isCurrent = view.key === current;
          return (
            <li key={view.key}>
              <Link
                href={view.href}
                aria-current={isCurrent ? "page" : undefined}
                className={`${ROW} ${isCurrent ? ROW_CURRENT : ROW_IDLE}`}
              >
                <view.icon className="text-ink-3 size-4 flex-none" strokeWidth={1.9} />
                <span className="flex-1 truncate">{view.label}</span>
                {view.count !== undefined && view.count > 0 && (
                  <span
                    className={`text-[13px] ${view.alarming ? "text-verm font-bold" : "text-ink-3"}`}
                  >
                    {view.count}
                  </span>
                )}
              </Link>
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
    </Frame>
  );
}
