import { connection } from "next/server";
import { Menu, Search } from "lucide-react";

import { BrandMark } from "@/components/brand";
import { Capture } from "@/components/capture";
import { Rail } from "@/components/rail";
import { TodayList } from "@/components/today-list";
import { formatLongDate, todayIn } from "@/lib/dates";
import { getPrincipal } from "@/lib/server/principal";
import { todayView } from "@/lib/server/task-service";

/**
 * Today is request-time, not prerendered: it reads a cookie to resolve the
 * principal, and the whole view derives from the current date.
 *
 * `instant = false` accepts a blocking render for now. M3 builds all four views
 * with a Suspense boundary per section, which is the point at which the static
 * chrome can prerender and only the counts and rows stream.
 */
export const instant = false;

export default async function TodayPage() {
  // Reading cookies already makes this dynamic, but Next still evaluates the
  // route in a prerender pass and rejects the `new Date()` behind `todayIn()`
  // as an unstable value. `connection()` opts out of that pass explicitly.
  await connection();

  const principal = await getPrincipal();

  // A first-time visitor has no owner row yet, so there is nothing to query.
  // The empty view costs zero round trips, which is what keeps crawler traffic
  // from touching the database at all.
  const data =
    principal.kind === "none"
      ? { tasks: [], subtasks: [], lists: [], labels: [], inboxCount: 0 }
      : await todayView(principal, todayIn(principal.timeZone));

  const now = principal.kind === "none" ? todayIn() : todayIn(principal.timeZone);

  return (
    <div className="bg-ground flex h-dvh overflow-hidden">
      <Rail
        lists={data.lists}
        labels={data.labels}
        counts={{ overdueAndToday: data.tasks.length, inbox: data.inboxCount }}
      />

      <main className="relative min-w-0 flex-1 scroll-pt-[200px] overflow-y-auto">
        <div className="mx-auto max-w-[780px] px-4 pb-[140px] md:px-10">
          {/* Header and capture travel together, pinned to the top of the scroll
              region, so the input is reachable from anywhere in a long list. */}
          <div className="bg-ground sticky top-0 z-10 pt-0 md:pt-[30px]">
            <div className="-mx-2 flex h-13 items-center gap-1 md:hidden">
              <button
                type="button"
                aria-label="Open views and lists"
                className="rounded-cell text-ink-2 hover:bg-hover grid size-9 place-items-center"
              >
                <Menu className="size-5" strokeWidth={1.9} />
              </button>
              <span className="flex flex-1 items-center gap-[9px] pl-1 text-[16px] leading-none font-bold">
                <BrandMark />
                Nexdo
              </span>
              <button
                type="button"
                aria-label="Search"
                className="rounded-cell text-ink-2 hover:bg-hover grid size-9 place-items-center"
              >
                <Search className="size-5" strokeWidth={1.9} />
              </button>
            </div>

            <header className="mb-4 flex items-start gap-4">
              <div className="min-w-0 flex-1">
                <h1 className="text-[26px] leading-[1.15] font-bold tracking-[-0.02em] text-balance md:text-[30px]">
                  Today
                </h1>
                {/* The design also shows the local time, the zone name, and a note
                    when UTC has already rolled over. Those arrive in M3. */}
                <div className="text-ink-2 mt-[5px] flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[14px]">
                  <span>{formatLongDate(now)}</span>
                </div>
              </div>
            </header>

            {/* Capturing from Today dates the task today, so it lands in the view
                you are looking at rather than silently in Inbox. */}
            <Capture today={now} />
          </div>

          <TodayList
            tasks={data.tasks}
            subtasks={data.subtasks}
            lists={data.lists}
            labels={data.labels}
            now={now}
          />
        </div>
      </main>
    </div>
  );
}
