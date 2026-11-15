import { connection } from "next/server";
import { CalendarCheck, Menu, Search } from "lucide-react";

import { BrandMark } from "@/components/brand";
import { Capture } from "@/components/capture";
import { EmptyState } from "@/components/empty-state";
import { Rail } from "@/components/rail";
import { TaskGroup } from "@/components/task-group";
import { TaskRow } from "@/components/task-row";
import { formatLongDate, isOverdue, isToday, today } from "@/lib/dates";
import { labels, lists, tasks } from "@/lib/fixtures";
import type { Task } from "@/lib/types";

/**
 * Today is a request-time route, not a prerendered one: the whole view is
 * derived from the current date, so a build-time snapshot would be stale by the
 * next midnight. M1 makes it request-time regardless, since resolving the
 * principal reads a cookie.
 *
 * `instant = false` accepts a blocking render for now. M3 builds all four views
 * with a Suspense boundary per section, which is the point at which the static
 * chrome can prerender and only the counts and rows stream.
 */
export const instant = false;

export default async function TodayPage() {
  await connection();

  const now = today();
  const listById = new Map(lists.map((l) => [l.id, l]));
  const labelById = new Map(labels.map((l) => [l.id, l]));

  // Indexed once rather than filtering `tasks` per row: the per-row filter is
  // free at fixture scale and quadratic at real scale.
  const subtasksByParent = new Map<string, Task[]>();
  for (const task of tasks) {
    if (task.parentId === null) continue;
    const siblings = subtasksByParent.get(task.parentId);
    if (siblings) siblings.push(task);
    else subtasksByParent.set(task.parentId, [task]);
  }

  const open = tasks.filter((t) => t.completedAt === null && t.parentId === null);
  const overdue = open.filter((t) => isOverdue(t.dueDate, now));
  const due = open.filter((t) => isToday(t.dueDate, now));
  const inbox = open.filter((t) => t.listId === null);

  const row = (task: Task) => (
    <TaskRow
      key={task.id}
      task={task}
      now={now}
      list={task.listId ? listById.get(task.listId) : undefined}
      labels={task.labelIds.map((id) => labelById.get(id)).filter((l) => l !== undefined)}
      subtasks={subtasksByParent.get(task.id)}
    />
  );

  return (
    <div className="bg-ground flex h-dvh overflow-hidden">
      <Rail
        lists={lists}
        labels={labels}
        counts={{ overdueAndToday: overdue.length + due.length, inbox: inbox.length }}
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
                {/* The design shows the local time and zone here, plus a note when
                    UTC has already rolled over. Both need the owner's zone rather
                    than the server's clock, so they arrive in M3. */}
                <div className="text-ink-2 mt-[5px] flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[14px]">
                  <span>{formatLongDate(now)}</span>
                </div>
              </div>
            </header>

            <Capture />
          </div>

          {overdue.length === 0 && due.length === 0 ? (
            <EmptyState
              icon={<CalendarCheck className="size-6" strokeWidth={1.9} />}
              title="Nothing due today"
            >
              Everything scheduled for today is done. Anything you add above without a date lands in
              Inbox.
            </EmptyState>
          ) : (
            <>
              {overdue.length > 0 && (
                <TaskGroup title="Overdue" count={overdue.length} tone="late">
                  {overdue.map(row)}
                </TaskGroup>
              )}
              {due.length > 0 && (
                <TaskGroup title="Today" count={due.length}>
                  {due.map(row)}
                </TaskGroup>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  );
}
