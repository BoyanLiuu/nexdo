import type { OwnedPrincipal } from "@/lib/server/principal";
import { prisma } from "@/lib/server/prisma";
import type { Label, List, Priority, Task } from "@/lib/types";

/**
 * All task rules live here. Actions are thin wrappers; components never touch
 * Prisma.
 *
 * Every function takes the principal first and filters on `ownerId`. That is
 * the authorization model: a guessed or forged id matches zero rows rather than
 * someone else's task. There is no second check to forget.
 */

/**
 * Append-ordered position key. Monotonic and lexicographically sortable, which
 * is all M1 needs. M4 replaces this with fractional indexing so a drag writes
 * one row instead of reindexing.
 */
function nextPosition(): string {
  return Date.now().toString(36);
}

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

/**
 * Everything the Today screen needs, in one round trip per entity rather than
 * one per row. Tasks due on or before `today` and not yet done, plus their
 * subtasks, plus the counts the rail shows.
 */
export async function todayView(principal: OwnedPrincipal, today: string) {
  const owner = { ownerId: principal.ownerId, deletedAt: null };

  const [open, subtasks, lists, labels, inboxCount] = await Promise.all([
    prisma.task.findMany({
      where: { ...owner, parentId: null, completedAt: null, dueDate: { lte: today } },
      select: TASK_SELECT,
      orderBy: [{ dueDate: "asc" }, { priority: "asc" }, { position: "asc" }],
    }),
    prisma.task.findMany({
      where: { ...owner, parentId: { not: null } },
      select: TASK_SELECT,
      orderBy: { position: "asc" },
    }),
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
    prisma.task.count({ where: { ...owner, parentId: null, completedAt: null, listId: null } }),
  ]);

  return {
    tasks: open.map(toTask),
    subtasks: subtasks.map(toTask),
    lists: lists as List[],
    labels: labels as Label[],
    inboxCount,
  };
}

export async function createTask(
  principal: OwnedPrincipal,
  title: string,
  dueDate: string | null = null,
): Promise<Task> {
  const row = await prisma.task.create({
    data: { ownerId: principal.ownerId, title, dueDate, position: nextPosition() },
    select: TASK_SELECT,
  });
  await touch(principal);
  return toTask(row);
}

/** Several titles from one paste, in one statement. */
export async function createTasks(
  principal: OwnedPrincipal,
  titles: string[],
  dueDate: string | null = null,
): Promise<number> {
  const base = Date.now();
  const { count } = await prisma.task.createMany({
    data: titles.map((title, i) => ({
      ownerId: principal.ownerId,
      title,
      dueDate,
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

export async function restoreTask(principal: OwnedPrincipal, id: string): Promise<void> {
  await prisma.task.updateMany({
    where: { id, ownerId: principal.ownerId },
    data: { deletedAt: null },
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
