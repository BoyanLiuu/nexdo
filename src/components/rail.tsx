import Link from "next/link";
import { Archive, CalendarCheck, CalendarDays, Inbox, Search, SquareCheck } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { Brand } from "@/components/brand";
import { AddToRail } from "@/components/rail-actions";
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

/** The rail highlights one of the four fixed views; list and label routes
 *  highlight their own row instead, so they are separate keys. */
export type ViewKey = "today" | "upcoming" | "inbox" | "completed" | "list" | "label";

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

function SectionHeading({
  title,
  kind,
  existingCount,
}: {
  title: string;
  kind: "list" | "label";
  existingCount: number;
}) {
  return (
    <div className="flex h-7 items-center justify-between pr-1 pb-1 pl-2.5">
      <h2 className="text-ink-2 text-[13px] font-[650]">{title}</h2>
      <AddToRail kind={kind} existingCount={existingCount} />
    </div>
  );
}

function Frame({
  search,
  children,
  placeholder = false,
}: {
  search?: React.ReactNode;
  children: React.ReactNode;
  /** The streaming fallback, which is scaffolding rather than navigation. */
  placeholder?: boolean;
}) {
  return (
    <nav
      // The placeholder is not labelled and is hidden from assistive tech: it
      // and the real rail are briefly in the DOM together while the query
      // resolves, and two navigations with the same name is both ambiguous to
      // a screen reader and unaddressable in a test.
      aria-label={placeholder ? undefined : "Views and lists"}
      aria-hidden={placeholder || undefined}
      // No `hidden md:flex` any more: `RailShell` decides whether the rail is
      // on screen. Hiding itself here as well meant the mobile drawer slid a
      // `display: none` element into view, which is to say nothing at all.
      // `h-full`, because the rail is no longer the flex child that stretches to
      // the viewport — `RailShell` is, and a nav inside it sizes to its own
      // content. Without this the rail's background stops under the last list
      // and the page shows through below it.
      className="w-rail border-rail-line bg-rail flex h-full shrink-0 flex-col overflow-y-auto border-r p-3"
    >
      <Brand />
      {search ?? (
        <div
          aria-hidden
          className="rounded-cell border-hair bg-card-paper text-ink-3 mb-1 flex h-9 items-center gap-2 border px-2.5 text-[14px]"
        >
          <Search className="size-4" strokeWidth={1.9} />
          <span className="flex-1 text-left">Search</span>
          <kbd className="border-hair rounded border px-1.5 font-sans text-[11px]">/</kbd>
        </div>
      )}
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
    <Frame placeholder>
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
  currentId,
  lists,
  labels,
  counts,
  search,
}: {
  current: ViewKey;
  /** Which list or label is open, when `current` is "list" or "label". */
  currentId?: string;
  lists: List[];
  labels: Label[];
  counts: RailCounts;
  /** The search dialog, passed in so the rail stays a Server Component. */
  search?: React.ReactNode;
}) {
  const active = lists.filter((l) => !l.isArchived);
  const archivedCount = lists.length - active.length;

  return (
    <Frame search={search}>
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
        <SectionHeading title="Lists" kind="list" existingCount={lists.length} />
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
        <SectionHeading title="Labels" kind="label" existingCount={labels.length} />
        <ul className="flex list-none flex-col gap-px">
          {labels.map((label) => (
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

      {/* The prototype's sync indicator sits here. It has no equivalent in this
          architecture; M7 puts the account and sign-in affordance in this slot. */}
      <div className="mt-auto pt-6" />
    </Frame>
  );
}
