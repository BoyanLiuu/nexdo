import type { OwnedPrincipal } from "@/lib/server/principal";
import { prisma } from "@/lib/server/prisma";

/** Upcoming shows a week, starting the day after today. */
export const UPCOMING_DAYS = 7;
import type { Prisma } from "@/generated/prisma/client";
import { addDays } from "@/lib/dates";
import { positionAfter } from "@/lib/ordering";
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
  // A listId or labelId can arrive from a parsed `#token`, which is client
  // input. Resolve both against this owner's rows and drop anything that does
  // not belong — a crafted request must not file a task into someone else's
  // list, and Zod can only check the shape, not the ownership.
  const requestedLists = [...new Set(inputs.map((i) => i.listId).filter(Boolean) as string[])];
  const requestedLabels = [...new Set(inputs.flatMap((i) => i.labelIds ?? []))];

  const [ownedLists, ownedLabels] = await Promise.all([
    requestedLists.length
      ? prisma.list.findMany({
          where: { id: { in: requestedLists }, ownerId: principal.ownerId, deletedAt: null },
          select: { id: true },
        })
      : [],
    requestedLabels.length
      ? prisma.label.findMany({
          where: { id: { in: requestedLabels }, ownerId: principal.ownerId, deletedAt: null },
          select: { id: true },
        })
      : [],
  ]);
  const listOk = new Set(ownedLists.map((l) => l.id));
  const labelOk = new Set(ownedLabels.map((l) => l.id));

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
      listId: input.listId && listOk.has(input.listId) ? input.listId : null,
      position: (base + i).toString(36),
    })),
  });
  // createMany cannot write the join rows, so labels need a second pass. Only
  // relevant when a `@label` token was used.
  const withLabels = inputs.filter((i) => (i.labelIds ?? []).some((id) => labelOk.has(id)));
  if (withLabels.length > 0) {
    const created = await prisma.task.findMany({
      where: { ownerId: principal.ownerId, title: { in: withLabels.map((i) => i.title) } },
      orderBy: { position: "desc" },
      take: withLabels.length,
      select: { id: true, title: true },
    });
    const idByTitle = new Map(created.map((t) => [t.title, t.id]));
    const joins = withLabels.flatMap((i) => {
      const taskId = idByTitle.get(i.title);
      if (!taskId) return [];
      return (i.labelIds ?? [])
        .filter((id) => labelOk.has(id))
        .map((labelId) => ({ taskId, labelId }));
    });
    if (joins.length > 0) {
      await prisma.taskLabel.createMany({ data: joins, skipDuplicates: true });
    }
  }

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

// ── M4: detail, subtasks, ordering, search ──────────────────────────────────

/** One task with everything the detail panel edits. */
export async function taskById(principal: OwnedPrincipal, id: string): Promise<Task | null> {
  const row = await prisma.task.findFirst({
    where: { id, ownerId: principal.ownerId, deletedAt: null },
    select: TASK_SELECT,
  });
  return row ? toTask(row) : null;
}

export async function updateTask(
  principal: OwnedPrincipal,
  id: string,
  fields: {
    title?: string;
    notes?: string;
    dueDate?: string | null;
    dueTime?: string | null;
    priority?: Priority;
    listId?: string | null;
  },
): Promise<void> {
  // A listId arriving from the client must belong to this owner, or a crafted
  // request could file a task into someone else's list. The ownerId filter
  // protects the task row; nothing protects the *reference* without this.
  if (fields.listId) {
    const list = await prisma.list.findFirst({
      where: { id: fields.listId, ownerId: principal.ownerId, deletedAt: null },
      select: { id: true },
    });
    if (!list) throw new Error("unknown list");
  }

  await prisma.task.updateMany({
    where: { id, ownerId: principal.ownerId, deletedAt: null },
    data: fields,
  });
  await touch(principal);
}

/** Replace a task's labels. Same ownership check as above, for the same reason. */
export async function setTaskLabels(
  principal: OwnedPrincipal,
  taskId: string,
  labelIds: string[],
): Promise<void> {
  const owned = await prisma.task.findFirst({
    where: { id: taskId, ownerId: principal.ownerId, deletedAt: null },
    select: { id: true },
  });
  if (!owned) return;

  const valid = await prisma.label.findMany({
    where: { id: { in: labelIds }, ownerId: principal.ownerId, deletedAt: null },
    select: { id: true },
  });

  await prisma.$transaction([
    prisma.taskLabel.deleteMany({ where: { taskId } }),
    prisma.taskLabel.createMany({
      data: valid.map((l) => ({ taskId, labelId: l.id })),
    }),
  ]);
  await touch(principal);
}

export async function createSubtask(
  principal: OwnedPrincipal,
  parentId: string,
  title: string,
): Promise<void> {
  const parent = await prisma.task.findFirst({
    where: { id: parentId, ownerId: principal.ownerId, deletedAt: null },
    select: { id: true, listId: true },
  });
  if (!parent) return;

  const last = await prisma.task.findFirst({
    where: { ownerId: principal.ownerId, parentId, deletedAt: null },
    orderBy: { position: "desc" },
    select: { position: true },
  });

  await prisma.task.create({
    data: {
      ownerId: principal.ownerId,
      parentId,
      // A subtask inherits its parent's list, so it never strands in Inbox.
      listId: parent.listId,
      title,
      position: positionAfter(last?.position ?? null),
    },
  });
  await touch(principal);
}

/** Persist a manual reorder. One row, which is the point of fractional keys. */
export async function moveTask(
  principal: OwnedPrincipal,
  id: string,
  position: string,
): Promise<void> {
  await prisma.task.updateMany({
    where: { id, ownerId: principal.ownerId, deletedAt: null },
    data: { position },
  });
  await touch(principal);
}

/** Open tasks in one list, for the list view. */
export async function tasksInList(
  principal: OwnedPrincipal,
  listId: string,
  sort: SortKey = "manual",
): Promise<{ tasks: Task[]; subtasks: Task[] }> {
  const rows = await prisma.task.findMany({
    where: {
      ownerId: principal.ownerId,
      deletedAt: null,
      parentId: null,
      completedAt: null,
      listId,
    },
    select: TASK_SELECT,
    orderBy: order(sort),
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

/** Open tasks carrying one label, across every list. */
export async function tasksWithLabel(
  principal: OwnedPrincipal,
  labelId: string,
  sort: SortKey = "manual",
): Promise<{ tasks: Task[]; subtasks: Task[] }> {
  const rows = await prisma.task.findMany({
    where: {
      ownerId: principal.ownerId,
      deletedAt: null,
      parentId: null,
      completedAt: null,
      labels: { some: { labelId } },
    },
    select: TASK_SELECT,
    orderBy: order(sort),
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

/**
 * Search titles and notes. Case-insensitive `contains`, which Postgres serves
 * with ILIKE — adequate at personal-todo scale and honest about its limits: no
 * stemming, no ranking, no typo tolerance. Full-text search would mean a
 * tsvector column and a GIN index, which is a real feature rather than a tweak.
 */
export async function searchTasks(
  principal: OwnedPrincipal,
  query: string,
  limit = 30,
): Promise<Task[]> {
  const q = query.trim();
  if (q.length < 2) return [];

  const rows = await prisma.task.findMany({
    where: {
      ownerId: principal.ownerId,
      deletedAt: null,
      OR: [
        { title: { contains: q, mode: "insensitive" } },
        { notes: { contains: q, mode: "insensitive" } },
      ],
    },
    select: TASK_SELECT,
    orderBy: [{ completedAt: "asc" }, { position: "asc" }],
    take: limit,
  });
  return rows.map(toTask);
}
