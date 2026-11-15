import type { ReactNode } from "react";

import { Capture } from "@/components/capture";
import { SortControl } from "@/components/sort-control";
import { TaskList } from "@/components/task-list";
import { userToday } from "@/components/view-data";
import { ViewSubtitle } from "@/components/view-shell";
import type { ViewKey } from "@/components/rail";
import { addDays, formatDayRange, formatLongDate } from "@/lib/dates";
import { getPrincipal } from "@/lib/server/principal";
import { UPCOMING_DAYS, tasksForView, viewChrome, type SortKey } from "@/lib/server/task-service";

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
  }
}

export async function ViewBody({
  view,
  searchParams,
  empty,
}: {
  view: ViewKey;
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
      : await Promise.all([tasksForView(principal, view, now, sort), viewChrome(principal, now)]);

  return (
    <>
      <ViewSubtitle>
        <span>{subtitleFor(view, now)}</span>
        {/* Completed is always newest-first, so a sort control there would lie. */}
        {view !== "completed" && <SortControl value={sort} />}
      </ViewSubtitle>

      {/* Capture dates new tasks for the view you are looking at, so they land
          where you can see them. Completed is a record, not a place to add to. */}
      {view !== "completed" && (
        <Capture
          today={now}
          defaultDueDate={view === "upcoming" ? addDays(now, 1) : view === "inbox" ? null : now}
        />
      )}

      <TaskList
        view={view}
        tasks={data.tasks}
        subtasks={data.subtasks}
        lists={chrome.lists}
        labels={chrome.labels}
        now={now}
        upcomingDays={UPCOMING_DAYS}
        empty={empty}
      />
    </>
  );
}
