import type { OwnedPrincipal } from "@/lib/server/principal";
import { prisma } from "@/lib/server/prisma";

/** Upcoming shows a week, starting the day after today. */
export const UPCOMING_DAYS = 7;
import { createId } from "@paralleldrive/cuid2";

import { Prisma } from "@/generated/prisma/client";
import { addDays, todayIn } from "@/lib/dates";
import { positionAfter } from "@/lib/ordering";
import { repeatSchema, type NewTask, type Repeat } from "@/lib/schemas";
import { nextDue, schedulesFromCompletion } from "@/lib/repeat";
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
  repeat: true,
  seriesId: true,
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
  repeat: Prisma.JsonValue | null;
  seriesId: string | null;
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
    repeat: parseRepeat(row.repeat),
    seriesId: row.seriesId,
  };
}

/**
 * A `Json` column is untyped storage. A rule written by an older build, or by
 * hand in a SQL console, must not crash a view — an unreadable rule reads as no
 * rule, so the task simply stops repeating instead of taking the page down.
 */
function parseRepeat(value: Prisma.JsonValue | null): Repeat | null {
  if (value === null || value === undefined) return null;
  const parsed = repeatSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
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

  // Every row gets an id before anything is written: the client sends one so
  // its optimistic row and this row are the same row, and anything arriving
  // without one gets the same treatment here rather than a second code path.
  const base = Date.now();
  const rows = inputs.map((input, i) => ({
    id: input.id ?? createId(),
    ownerId: principal.ownerId,
    title: input.title,
    dueDate: input.dueDate ?? null,
    dueTime: input.dueTime ?? null,
    priority: input.priority,
    listId: input.listId && listOk.has(input.listId) ? input.listId : null,
    // A pasted block keeps the order it was written in, whether the keys come
    // from the client or from this single base.
    position: input.position ?? (base + i).toString(36),
  }));

  // One statement for the whole paste.
  const { count } = await prisma.task.createMany({ data: rows });

  // `createMany` cannot write join rows, so labels need a second statement —
  // but no longer a second *query*. This used to read the tasks back and match
  // them up by title, which cost a round trip and attached labels to the wrong
  // task whenever two tasks shared a title.
  const joins = rows.flatMap((row, i) =>
    (inputs[i].labelIds ?? [])
      .filter((labelId) => labelOk.has(labelId))
      .map((labelId) => ({ taskId: row.id, labelId })),
  );
  if (joins.length > 0) {
    await prisma.taskLabel.createMany({ data: joins, skipDuplicates: true });
  }

  await touch(principal);
  return count;
}

export async function completeTask(principal: OwnedPrincipal, id: string): Promise<void> {
  // Completion now costs a read before the write, because what happens next
  // depends on a rule that only the row knows. That is a real cost on the
  // app's hottest action and it is paid by every task, repeating or not —
  // accepted because the click is already optimistic, so the user waits for
  // neither statement.
  const task = await prisma.task.findFirst({
    where: { id, ownerId: principal.ownerId, deletedAt: null, completedAt: null },
    // The view select already names every field the next occurrence is cloned
    // from. Spelling them out again is a second list to forget to update.
    select: TASK_SELECT,
  });
  if (!task) return;

  const completedAt = new Date();
  const rule = parseRepeat(task.repeat);
  const base =
    rule && schedulesFromCompletion(rule)
      ? todayIn(principal.timeZone)
      : task.dueDate?.trim() || null;

  // A fixed rule with no due date has nothing to advance from. Rather than
  // inventing an anchor, the task completes once and stops — and the editor
  // refuses to set such a rule in the first place.
  if (!rule || !base) {
    await prisma.task.updateMany({
      where: { id, ownerId: principal.ownerId, deletedAt: null },
      data: { completedAt },
    });
    await touch(principal);
    return;
  }

  // The first occurrence's own id becomes the series id, so a series needs no
  // separate table and no id generated up front.
  const seriesId = task.seriesId ?? task.id;

  // One transaction, because a crash between these two statements would either
  // lose the series or complete nothing. The whole point of the occurrence
  // model is that history is a row, so a half-written history is worse than an
  // unrecorded completion.
  await prisma.$transaction([
    prisma.task.updateMany({
      where: { id, ownerId: principal.ownerId, deletedAt: null },
      data: { completedAt, seriesId },
    }),
    prisma.task.create({
      data: {
        ownerId: principal.ownerId,
        listId: task.listId,
        parentId: task.parentId,
        title: task.title,
        notes: task.notes,
        dueDate: nextDue(rule, base),
        dueTime: task.dueTime?.trim() || null,
        priority: task.priority,
        position: task.position,
        repeat: rule,
        seriesId,
        labels: { create: task.labels.map((l) => ({ labelId: l.labelId })) },
      },
    }),
  ]);
  await touch(principal);
}

/**
 * Undo of a completion — and for a repeating task that means undoing the
 * occurrence its completion spawned, or the undo would leave two live copies.
 *
 * The spawned row is found without a back-pointer column because of an
 * invariant the model gives for free: **a series has at most one open
 * occurrence at a time.** Only completing spawns the next one, so the open
 * sibling is necessarily the one this completion created.
 */
export async function uncompleteTask(principal: OwnedPrincipal, id: string): Promise<void> {
  const task = await prisma.task.findFirst({
    where: { id, ownerId: principal.ownerId, deletedAt: null },
    select: { seriesId: true },
  });
  if (!task) return;

  // Built once and used in exactly one of the two branches below. A Prisma
  // query is lazy — it runs when awaited or when handed to `$transaction`, not
  // when constructed — so this cannot fire twice.
  const reopen = prisma.task.updateMany({
    where: { id, ownerId: principal.ownerId, deletedAt: null },
    data: { completedAt: null },
  });

  if (task.seriesId === null) {
    await reopen;
    await touch(principal);
    return;
  }

  await prisma.$transaction([
    // Soft, not hard: undo should be reversible too, and the row may have been
    // edited between the completion and the undo.
    prisma.task.updateMany({
      where: {
        seriesId: task.seriesId,
        ownerId: principal.ownerId,
        completedAt: null,
        deletedAt: null,
        id: { not: id },
      },
      data: { deletedAt: new Date() },
    }),
    reopen,
  ]);
  await touch(principal);
}

/**
 * Move a repeating task to its next occurrence without recording a completion.
 *
 * Skipping advances the same row rather than closing it and opening another:
 * you did not do the thing, so there is no history to write, and the series
 * keeps its single open occurrence.
 */
export async function skipOccurrence(principal: OwnedPrincipal, id: string): Promise<void> {
  const task = await prisma.task.findFirst({
    where: { id, ownerId: principal.ownerId, deletedAt: null, completedAt: null },
    select: { dueDate: true, repeat: true },
  });
  if (!task) return;

  const rule = parseRepeat(task.repeat);
  if (!rule) return;

  // An `afterCompletion` rule has no schedule to skip along, so it counts from
  // today — "do it three days from now instead" is the only sensible reading.
  const base = schedulesFromCompletion(rule)
    ? todayIn(principal.timeZone)
    : task.dueDate?.trim() || null;
  if (!base) return;

  await prisma.task.updateMany({
    where: { id, ownerId: principal.ownerId, deletedAt: null },
    data: { dueDate: nextDue(rule, base) },
  });
  await touch(principal);
}

/**
 * Set or clear the repeat rule. `null` clears it, which is how a repeating task
 * stops repeating — the occurrences already in history stay there.
 */
export async function setRepeat(
  principal: OwnedPrincipal,
  id: string,
  repeat: Repeat | null,
): Promise<void> {
  await prisma.task.updateMany({
    where: { id, ownerId: principal.ownerId, deletedAt: null },
    // `DbNull` writes SQL NULL; plain `null` would store the JSON value `null`,
    // which is a rule that exists and says nothing.
    data: { repeat: repeat ?? Prisma.DbNull },
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
