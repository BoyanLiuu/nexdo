import type { OwnedPrincipal } from "@/lib/server/principal";
import { prisma } from "@/lib/server/prisma";

/** Upcoming shows a week, starting the day after today. */
export const UPCOMING_DAYS = 7;
import type { Prisma } from "@/generated/prisma/client";
import { addDays } from "@/lib/dates";
import type { NewTask } from "@/lib/schemas";
import type { Label, List, Priority, Task } from "@/lib/types";

/**
 * All task rules live here. Actions are thin wrappers; components never touch
 * Prisma.
 *
 * Every function takes the principal first and filters on `ownerId`. That is
 * the authorization model: a guessed or forged id matches zero rows rather than
 * someone else's task. There is no second check to forget.
 */

/** Prisma rows carry Date objects and relations; the view layer wants plain data. */
const TASK_SELECT = {
  id: true,
  listId: true,
  parentId: true,
  title: true,
  notes: true,
  dueDate: true,
  dueTime: true,
  priority: true,
  position: true,
  completedAt: true,
  labels: { select: { labelId: true } },
} as const;

type TaskRow = {
  id: string;
  listId: string | null;
  parentId: string | null;
  title: string;
  notes: string;
  dueDate: string | null;
  dueTime: string | null;
  priority: number;
  position: string;
  completedAt: Date | null;
  labels: { labelId: string }[];
};

function toTask(row: TaskRow): Task {
  return {
    id: row.id,
    listId: row.listId,
    parentId: row.parentId,
    title: row.title,
    notes: row.notes,
    // Char(10) and Char(5) are blank-padded by Postgres; trim so string
    // comparison against today's date still works.
    dueDate: row.dueDate?.trim() || null,
    dueTime: row.dueTime?.trim() || null,
    priority: row.priority as Priority,
    position: row.position,
    labelIds: row.labels.map((l) => l.labelId),
    completedAt: row.completedAt?.toISOString() ?? null,
  };
}

export type SortKey = "manual" | "due" | "priority";

/** Chrome every view needs: the rail's lists, labels and counts. */
export async function viewChrome(principal: OwnedPrincipal, today: string) {
  const owner = { ownerId: principal.ownerId, deletedAt: null };
  const open = { ...owner, parentId: null, completedAt: null };

  const [lists, labels, dueCount, inboxCount, upcomingCount, completedCount] = await Promise.all([
    prisma.list.findMany({
      where: owner,
      select: { id: true, name: true, colour: true, emoji: true, position: true, isArchived: true },
      orderBy: { position: "asc" },
    }),
    prisma.label.findMany({
      where: owner,
      select: { id: true, name: true, colour: true },
      orderBy: { name: "asc" },
    }),
    prisma.task.count({ where: { ...open, dueDate: { lte: today } } }),
    prisma.task.count({ where: { ...open, listId: null } }),
    prisma.task.count({ where: { ...open, dueDate: { gt: today } } }),
    prisma.task.count({ where: { ...owner, parentId: null, NOT: { completedAt: null } } }),
  ]);

  return {
    lists: lists as List[],
    labels: labels as Label[],
    counts: {
      due: dueCount,
      inbox: inboxCount,
      upcoming: upcomingCount,
      completed: completedCount,
    },
  };
}

/**
 * `orderBy` per sort mode.
 *
 * `due` puts undated tasks last rather than first — Postgres sorts NULLs last on
 * ASC by default, which happens to be what we want, but it is stated explicitly
 * so a later change to the column cannot silently invert it.
 */
function order(sort: SortKey): Prisma.TaskOrderByWithRelationInput[] {
  switch (sort) {
    case "due":
      return [{ dueDate: { sort: "asc", nulls: "last" } }, { dueTime: "asc" }, { position: "asc" }];
    case "priority":
      return [
        { priority: "asc" },
        { dueDate: { sort: "asc", nulls: "last" } },
        { position: "asc" },
      ];
    case "manual":
      return [{ position: "asc" }];
  }
}

/** Subtasks for a set of parents, fetched once rather than per row. */
async function subtasksOf(principal: OwnedPrincipal, parentIds: string[]): Promise<Task[]> {
  if (parentIds.length === 0) return [];
  const rows = await prisma.task.findMany({
    where: { ownerId: principal.ownerId, deletedAt: null, parentId: { in: parentIds } },
    select: TASK_SELECT,
    orderBy: { position: "asc" },
  });
  return rows.map(toTask);
}

type ViewName = "today" | "upcoming" | "inbox" | "completed";

/**
 * The rows for one view. `today` is the user's calendar date, computed from
 * their zone by the caller — this function never reads a clock.
 */
export async function tasksForView(
  principal: OwnedPrincipal,
  view: ViewName,
  today: string,
  sort: SortKey = "manual",
): Promise<{ tasks: Task[]; subtasks: Task[] }> {
  const owner = { ownerId: principal.ownerId, deletedAt: null };
  const open = { ...owner, parentId: null, completedAt: null };

  const where =
    view === "today"
      ? { ...open, dueDate: { lte: today } }
      : view === "upcoming"
        ? // Tomorrow through tomorrow+6, which is `UPCOMING_DAYS` days inclusive and
          // must match the window `groupByDay` lays out — a narrower query leaves
          // the last heading permanently empty.
          { ...open, dueDate: { gt: today, lte: addDays(today, UPCOMING_DAYS) } }
        : view === "inbox"
          ? { ...open, listId: null }
          : { ...owner, parentId: null, NOT: { completedAt: null } };

  const rows = await prisma.task.findMany({
    where,
    select: TASK_SELECT,
    // Completed reads newest-first; everything else honours the sort control.
    orderBy: view === "completed" ? [{ completedAt: "desc" }] : order(sort),
    take: view === "completed" ? 100 : undefined,
  });

  const tasks = rows.map(toTask);
  return {
    tasks,
    subtasks: await subtasksOf(
      principal,
      tasks.map((t) => t.id),
    ),
  };
}

export async function createTasks(principal: OwnedPrincipal, inputs: NewTask[]): Promise<number> {
  // One statement for the whole paste. `position` is derived from a single base
  // so a pasted block keeps the order it was written in.
  const base = Date.now();
  const { count } = await prisma.task.createMany({
    data: inputs.map((input, i) => ({
      ownerId: principal.ownerId,
      title: input.title,
      dueDate: input.dueDate ?? null,
      dueTime: input.dueTime ?? null,
      priority: input.priority,
      position: (base + i).toString(36),
    })),
  });
  await touch(principal);
  return count;
}

export async function completeTask(principal: OwnedPrincipal, id: string): Promise<void> {
  // updateMany, not update: `where` can then include ownerId, so another
  // owner's id updates zero rows instead of throwing a not-found that would
  // confirm the row exists.
  await prisma.task.updateMany({
    where: { id, ownerId: principal.ownerId, deletedAt: null },
    data: { completedAt: new Date() },
  });
  await touch(principal);
}

export async function uncompleteTask(principal: OwnedPrincipal, id: string): Promise<void> {
  await prisma.task.updateMany({
    where: { id, ownerId: principal.ownerId, deletedAt: null },
    data: { completedAt: null },
  });
  await touch(principal);
}

export async function renameTask(
  principal: OwnedPrincipal,
  id: string,
  title: string,
): Promise<void> {
  await prisma.task.updateMany({
    where: { id, ownerId: principal.ownerId, deletedAt: null },
    data: { title },
  });
  await touch(principal);
}

/** Soft delete, so the undo window only has to clear a column. */
export async function deleteTask(principal: OwnedPrincipal, id: string): Promise<void> {
  await prisma.task.updateMany({
    where: { id, ownerId: principal.ownerId },
    data: { deletedAt: new Date() },
  });
  await touch(principal);
}

/** Touched on mutation only, never on read — it drives pruning of idle guests. */
async function touch(principal: OwnedPrincipal): Promise<void> {
  await prisma.owner.update({
    where: { id: principal.ownerId },
    data: { lastSeenAt: new Date() },
  });
}
