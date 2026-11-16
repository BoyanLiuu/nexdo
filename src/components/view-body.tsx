import type { ReactNode } from "react";

import { SortControl } from "@/components/sort-control";
import { TaskBoard } from "@/components/task-board";
import { userToday } from "@/components/view-data";
import { ViewSubtitle } from "@/components/view-shell";
import type { ViewKey } from "@/components/rail";
import { addDays, formatDayRange, formatLongDate } from "@/lib/dates";
import { getPrincipal } from "@/lib/server/principal";
import {
  UPCOMING_DAYS,
  tasksForView,
  tasksInList,
  tasksWithLabel,
  viewChrome,
  type SortKey,
} from "@/lib/server/task-service";

/**
 * Everything in a view that needs the database: the subtitle, the capture box
 * and the rows. Each route wraps this in one Suspense boundary, so the shell and
 * the title render before any query resolves.
 */

const SORTS = new Set<SortKey>(["manual", "due", "priority"]);

/** A search param is user input, so it is validated rather than cast. */
export function readSort(value: string | string[] | undefined): SortKey {
  const first = Array.isArray(value) ? value[0] : value;
  return first && SORTS.has(first as SortKey) ? (first as SortKey) : "manual";
}

function subtitleFor(view: ViewKey, now: string): ReactNode {
  switch (view) {
    case "today":
      // The design also shows the local time, the zone name, and a note when UTC
      // has already rolled over. Those need a live clock, so they are client-side
      // work and not in this milestone.
      return formatLongDate(now);
    case "upcoming":
      return formatDayRange(addDays(now, 1), addDays(now, UPCOMING_DAYS));
    case "inbox":
      return "Everything captured without a list.";
    case "completed":
      return "The last hundred, newest first.";
    default:
      return null;
  }
}

export async function ViewBody({
  view,
  targetId,
  title,
  searchParams,
  empty,
}: {
  view: ViewKey;
  /** The list or label id, when `view` is "list" or "label". */
  targetId?: string;
  /** Overrides the subtitle for a list or label view. */
  title?: string;
  /**
   * Passed as a promise and awaited here, not in the route. Reading
   * `searchParams` outside a Suspense boundary makes Next give up on
   * prerendering the whole route, which would cost the shell its instant paint.
   */
  searchParams?: Promise<{ sort?: string }>;
  empty: ReactNode;
}) {
  const sort = readSort((await searchParams)?.sort);
  const principal = await getPrincipal();
  const now = await userToday();

  // Nothing written yet means no owner row, so there is nothing to query. The
  // empty view costs zero round trips, which is what keeps crawler traffic off
  // the database entirely.
  const [data, chrome] =
    principal.kind === "none"
      ? [
          { tasks: [], subtasks: [] },
          { lists: [], labels: [] },
        ]
      : await Promise.all([
          view === "list" && targetId
            ? tasksInList(principal, targetId, sort)
            : view === "label" && targetId
              ? tasksWithLabel(principal, targetId, sort)
              : tasksForView(
                  principal,
                  view as "today" | "upcoming" | "inbox" | "completed",
                  now,
                  sort,
                ),
          viewChrome(principal, now),
        ]);

  return (
    <>
      <ViewSubtitle>
        <span>{title ?? subtitleFor(view, now)}</span>
        {/* Completed is always newest-first, so a sort control there would lie. */}
        {view !== "completed" && <SortControl value={sort} />}
      </ViewSubtitle>

      <TaskBoard
        view={view}
        tasks={data.tasks}
        subtasks={data.subtasks}
        lists={chrome.lists}
        labels={chrome.labels}
        now={now}
        upcomingDays={UPCOMING_DAYS}
        sort={sort}
        // Upcoming spans seven day-groups, so one `position` cannot express an
        // order across them; Completed is a record. Both stay undraggable.
        sortable={view === "today" || view === "inbox" || view === "list" || view === "label"}
        empty={empty}
        // Capture dates new tasks for the view you are looking at, so they land
        // where you can see them. Completed is a record, not a place to add to —
        // and `TaskBoard` renders the box itself because it owns the array a new
        // task has to be inserted into.
        capture={
          view === "completed"
            ? null
            : {
                // An offset from "today" rather than a date, because which day
                // that is depends on a zone this request may not know yet.
                dueOffsetDays: view === "upcoming" ? 1 : view === "today" ? 0 : null,
                defaultListId: view === "list" ? (targetId ?? null) : null,
                // False for a visitor who has never written: there is no owner,
                // so no stored zone, and `now` above is UTC. The browser knows
                // better, and capture asks it.
                zoneKnown: principal.kind !== "none",
              }
        }
      />
    </>
  );
}
