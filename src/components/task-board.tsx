"use client";

import { useOptimistic, useState, useTransition } from "react";
import { toast } from "sonner";

import { Capture } from "@/components/capture";
import { SortableRows } from "@/components/sortable-rows";
import { TaskDetail } from "@/components/task-detail";
import { TaskGroup } from "@/components/task-group";
import { TaskRow } from "@/components/task-row";
import { attempt } from "@/lib/actions/attempt";
import { usePendingWriteGuard } from "@/lib/use-pending-write";
import { completeTask, deleteTask, moveTask, renameTask, uncompleteTask } from "@/lib/actions/task";
import { positionForMove } from "@/lib/ordering";
import { focusAfterRemoval, useRowKeyboard } from "@/lib/use-row-keyboard";
import { addDays, formatDayHeading, groupByDay, isOverdue, isToday } from "@/lib/dates";
import type { ViewKey } from "@/components/rail";
import type { SortKey } from "@/lib/server/task-service";
import type { Label, List, Task } from "@/lib/types";

/**
 * The optimistic boundary, shared by every view.
 *
 * `useOptimistic` lives here rather than in TaskRow because completing a task
 * removes it from the view — a row cannot remove itself from its parent's array.
 * Anything that changes *which* rows are shown has to be applied where the list
 * is owned.
 *
 * The capture box is rendered here, not beside this component, for the same
 * reason. It was previously a sibling under `ViewBody` — a Server Component,
 * which can hold no state — so the component that knew a task had been created
 * and the component that owned the task array had nowhere to meet, and creating
 * a task was the one mutation that could not be optimistic. It waited roughly
 * 700ms for a round trip while completing one took 8ms.
 *
 * Grouping also happens here rather than on the server, so an optimistic change
 * re-groups immediately: tick the last task of a day and that day's heading goes
 * with it.
 */

type Action =
  /** Both complete and uncomplete remove the row: Today shows open tasks and
   *  Completed shows done ones, so either transition leaves the current view. */
  /** A created task, drawn before the insert has landed. */
  | { type: "insert"; tasks: Task[] }
  | { type: "remove"; id: string }
  | { type: "restore"; task: Task }
  | { type: "rename"; id: string; title: string }
  | { type: "move"; id: string; position: string };

function reduce(tasks: Task[], action: Action): Task[] {
  switch (action.type) {
    case "insert":
      // Appended and re-sorted by key, so a new task lands where its position
      // puts it rather than always at the bottom. `groupsFor` then decides
      // whether this view shows it at all — a task dated Friday captured on
      // Today is inserted here and correctly filtered out of the view.
      return [...tasks, ...action.tasks].sort((a, b) => (a.position < b.position ? -1 : 1));
    case "remove":
      return tasks.filter((t) => t.id !== action.id);
    case "restore":
      return tasks.some((t) => t.id === action.task.id) ? tasks : [...tasks, action.task];
    case "rename":
      return tasks.map((t) => (t.id === action.id ? { ...t, title: action.title } : t));
    case "move":
      // Re-sorted by the new key, so the row lands where it was dropped before
      // the server has heard about it.
      return tasks
        .map((t) => (t.id === action.id ? { ...t, position: action.position } : t))
        .sort((a, b) => (a.position < b.position ? -1 : 1));
    default:
      return tasks;
  }
}

type Group = { key: string; title: string; tone?: "late"; tasks: Task[] };

/** Upcoming keeps empty days so the week shows its shape, not only its busy parts. */
function groupsFor(view: ViewKey, tasks: Task[], now: string, upcomingDays: number): Group[] {
  switch (view) {
    case "today": {
      const overdue = tasks.filter((t) => isOverdue(t.dueDate, now));
      const due = tasks.filter((t) => isToday(t.dueDate, now));
      return [
        { key: "overdue", title: "Overdue", tone: "late" as const, tasks: overdue },
        { key: "today", title: "Today", tasks: due },
      ].filter((g) => g.tasks.length > 0);
    }
    case "upcoming":
      return groupByDay(tasks, addDays(now, 1), upcomingDays).map((day) => ({
        key: day.date,
        title: formatDayHeading(day.date, now),
        tasks: day.items,
      }));
    case "inbox":
      return [{ key: "inbox", title: "No list", tasks }];
    case "completed":
      return [{ key: "completed", title: "Recently completed", tasks }];
    // A list or label view is one flat group; its name is already the page title.
    default:
      return [{ key: "all", title: "Tasks", tasks }];
  }
}

export function TaskBoard({
  view,
  tasks,
  subtasks,
  lists,
  labels,
  now,
  upcomingDays,
  sort,
  sortable = false,
  empty,
  capture,
}: {
  view: ViewKey;
  tasks: Task[];
  subtasks: Task[];
  lists: List[];
  labels: Label[];
  now: string;
  upcomingDays: number;
  /** Which ordering the server applied; dragging only makes sense under "manual". */
  sort: SortKey;
  /** Views with a stable single list can reorder. Upcoming spans days, so it cannot. */
  sortable?: boolean;
  /** Shown when the view has nothing in it at all. Written per view. */
  empty: React.ReactNode;
  /**
   * Capture's view-dependent defaults, or null where there is nothing to add to
   * (Completed is a record). Passed as values rather than as a ready-made
   * element because capture needs the insert callback this component owns.
   */
  capture: { defaultDueDate: string | null; defaultListId: string | null } | null;
}) {
  const [optimistic, apply] = useOptimistic(tasks, reduce);
  /**
   * Subtasks are a separate array because they must not appear as rows: the
   * views render `optimistic` directly, and a subtask in there would show up
   * as a task of its own. Only inserts need to be optimistic — nothing in the
   * panel removes or reorders a subtask yet.
   */
  const [optimisticSubtasks, applySubtask] = useOptimistic(
    subtasks,
    (current: Task[], added: Task) => [...current, added],
  );
  const [pending, startTransition] = useTransition();

  // A tick or a delete is optimistic, so the row is already gone from the screen
  // while the write is still travelling. Leaving now loses it silently.
  usePendingWriteGuard(pending);

  const [detailId, setDetailId] = useState<string | null>(null);

  // The keyboard cursor.
  const [focusedId, setFocusedId] = useState<string | null>(null);
  // Which row is being renamed. One owner, here, because `E` arrives at the
  // list and only one row can be editing at once.
  const [editingId, setEditingId] = useState<string | null>(null);

  const listById = new Map(lists.map((l) => [l.id, l]));
  const labelById = new Map(labels.map((l) => [l.id, l]));

  const subtasksByParent = new Map<string, Task[]>();
  for (const task of optimisticSubtasks) {
    if (!task.parentId) continue;
    const siblings = subtasksByParent.get(task.parentId);
    if (siblings) siblings.push(task);
    else subtasksByParent.set(task.parentId, [task]);
  }

  /**
   * Apply optimistically, call the action, report the outcome. `onSuccess` runs
   * only once the write is known to have landed — announcing success earlier
   * tells the user their work is saved when it is not.
   */
  function run(
    action: Action,
    call: () => Promise<unknown>,
    failure: string,
    onSuccess?: () => void,
  ) {
    startTransition(async () => {
      apply(action);
      const outcome = await attempt(call, failure);

      if (outcome.status === "ok") onSuccess?.();
      else if (outcome.status === "slow")
        toast.warning("Still saving. Reload to see where this ended up.");
      else toast.error(outcome.message);
    });
  }

  function onToggle(task: Task) {
    const done = task.completedAt !== null;
    const verb = done ? "Reopened" : "Completed";
    handoffFocus(task.id);

    run(
      { type: "remove", id: task.id },
      () => (done ? uncompleteTask({ id: task.id }) : completeTask({ id: task.id })),
      done ? "Could not reopen that task." : "Could not complete that task.",
      () =>
        toast.success(`${verb} “${task.title}”`, {
          duration: 5000,
          action: {
            label: "Undo",
            onClick: () =>
              run(
                { type: "restore", task },
                () => (done ? completeTask({ id: task.id }) : uncompleteTask({ id: task.id })),
                "Could not undo that.",
              ),
          },
        }),
    );
  }

  const groups = groupsFor(view, optimistic, now, upcomingDays);
  /** Render order, flattened — what the arrows walk through. */
  const taskIds = groups.flatMap((group) => group.tasks.map((task) => task.id));

  /**
   * Manual order only. Under a date or priority sort the visual order comes
   * from the data, so dragging would be a lie — the row would snap back on the
   * next render.
   */
  const reorderable = sortable && sort === "manual";

  /**
   * Moves the keyboard cursor off a row that is about to disappear. Called
   * before the optimistic removal, while the row is still in the list and its
   * neighbours can still be found.
   */
  function handoffFocus(id: string) {
    if (focusedId === id) setFocusedId(focusAfterRemoval(taskIds, id));
  }

  function onMove(group: Task[], id: string, from: number, to: number) {
    const position = positionForMove(
      group.map((t) => t.position),
      from,
      to,
    );
    run(
      { type: "move", id, position },
      () => moveTask({ id, position }),
      "Could not move that task.",
    );
  }

  /** ⌥↑/⌥↓: one place within the row's own group, which is what dragging does. */
  function onKeyboardReorder(id: string, delta: -1 | 1) {
    const group = groups.find((g) => g.tasks.some((t) => t.id === id));
    if (!group) return;
    const from = group.tasks.findIndex((t) => t.id === id);
    const to = from + delta;
    if (to < 0 || to >= group.tasks.length) return;
    onMove(group.tasks, id, from, to);
  }

  function deleteTaskById(id: string) {
    const task = optimistic.find((t) => t.id === id);
    if (!task) return;
    handoffFocus(id);
    run({ type: "remove", id }, () => deleteTask({ id }), "Could not delete that task.");
  }

  useRowKeyboard({
    taskIds,
    focusedId,
    setFocusedId,
    onToggle: (id) => {
      const task = optimistic.find((t) => t.id === id);
      if (task) onToggle(task);
    },
    onOpenDetail: setDetailId,
    onStartRename: setEditingId,
    onDelete: deleteTaskById,
    onReorder: reorderable ? onKeyboardReorder : null,
  });

  const captureBox = capture && (
    <Capture
      today={now}
      defaultDueDate={capture.defaultDueDate}
      defaultListId={capture.defaultListId}
      // The highest key on screen. `optimistic` is kept sorted, so this is its
      // last element — and new tasks chain from it.
      lastPosition={optimistic.at(-1)?.position ?? null}
      lists={lists}
      labels={labels}
      onCreate={(created) => apply({ type: "insert", tasks: created })}
    />
  );

  // Rendered before the early return, or an empty view would have no way to add
  // the first task.
  if (optimistic.length === 0)
    return (
      <>
        {captureBox}
        {empty}
      </>
    );

  const detailTask = detailId ? optimistic.find((t) => t.id === detailId) : undefined;

  return (
    <>
      {captureBox}

      {detailTask && (
        <TaskDetail
          key={detailTask.id}
          task={detailTask}
          subtasks={subtasksByParent.get(detailTask.id) ?? []}
          onCreateSubtask={(subtask) => applySubtask(subtask)}
          lists={lists}
          labels={labels}
          now={now}
          open
          onOpenChange={(next) => !next && setDetailId(null)}
        />
      )}

      {groups.map((group) => (
        <TaskGroup key={group.key} title={group.title} count={group.tasks.length} tone={group.tone}>
          {group.tasks.length === 0 ? (
            <li className="text-ink-3 px-2 py-3 text-[13.5px]">Nothing due</li>
          ) : reorderable ? (
            <SortableRows
              tasks={group.tasks}
              onMove={(id, from, to) => onMove(group.tasks, id, from, to)}
            >
              {({ task, dragHandle, style }) => (
                <div style={style}>
                  <TaskRow
                    task={task}
                    now={now}
                    list={task.listId ? listById.get(task.listId) : undefined}
                    labels={task.labelIds
                      .map((id) => labelById.get(id))
                      .filter((l) => l !== undefined)}
                    subtasks={subtasksByParent.get(task.id)}
                    dragHandle={dragHandle}
                    focused={focusedId === task.id}
                    tabbable={focusedId === null && task.id === taskIds[0]}
                    editing={editingId === task.id}
                    onEditingChange={(next) => setEditingId(next ? task.id : null)}
                    onFocusRequest={() => setFocusedId(task.id)}
                    onOpenDetail={() => setDetailId(task.id)}
                    onComplete={() => onToggle(task)}
                    onRename={(title) =>
                      run(
                        { type: "rename", id: task.id, title },
                        () => renameTask({ id: task.id, title }),
                        "Could not rename that task.",
                      )
                    }
                    onDelete={() =>
                      run(
                        { type: "remove", id: task.id },
                        () => deleteTask({ id: task.id }),
                        "Could not delete that task.",
                      )
                    }
                  />
                </div>
              )}
            </SortableRows>
          ) : (
            group.tasks.map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                onOpenDetail={() => setDetailId(task.id)}
                now={now}
                list={task.listId ? listById.get(task.listId) : undefined}
                labels={task.labelIds.map((id) => labelById.get(id)).filter((l) => l !== undefined)}
                subtasks={subtasksByParent.get(task.id)}
                focused={focusedId === task.id}
                tabbable={focusedId === null && task.id === taskIds[0]}
                editing={editingId === task.id}
                onEditingChange={(next) => setEditingId(next ? task.id : null)}
                onFocusRequest={() => setFocusedId(task.id)}
                onComplete={() => onToggle(task)}
                onRename={(title) =>
                  run(
                    { type: "rename", id: task.id, title },
                    () => renameTask({ id: task.id, title }),
                    "Could not rename that task.",
                  )
                }
                onDelete={() =>
                  run(
                    { type: "remove", id: task.id },
                    () => deleteTask({ id: task.id }),
                    "Could not delete that task.",
                  )
                }
              />
            ))
          )}
        </TaskGroup>
      ))}
    </>
  );
}
