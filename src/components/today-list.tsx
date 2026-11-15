"use client";

import { useOptimistic, useTransition } from "react";
import { CalendarCheck } from "lucide-react";
import { toast } from "sonner";

import { EmptyState } from "@/components/empty-state";
import { TaskGroup } from "@/components/task-group";
import { TaskRow } from "@/components/task-row";
import { attempt } from "@/lib/actions/attempt";
import { completeTask, deleteTask, renameTask, uncompleteTask } from "@/lib/actions/task";
import { isOverdue, isToday } from "@/lib/dates";
import type { Label, List, Task } from "@/lib/types";

/**
 * The optimistic boundary.
 *
 * `useOptimistic` lives here rather than inside TaskRow because completing a
 * task removes it from this view — a row cannot remove itself from its parent's
 * array. Anything that changes *which* rows are shown has to be applied at the
 * level that owns the list.
 *
 * The optimistic shape is identical to the server shape (`Task[]`), so when
 * `revalidatePath` lands there is nothing to reconcile and the rows do not
 * flicker.
 */

type Action =
  | { type: "complete"; id: string }
  | { type: "uncomplete"; id: string; task: Task }
  | { type: "rename"; id: string; title: string }
  | { type: "delete"; id: string };

function reduce(tasks: Task[], action: Action): Task[] {
  switch (action.type) {
    case "complete":
      // Dropped rather than flagged: Today shows open tasks, so a completed one
      // leaves immediately. That is also what makes the undo window necessary.
      return tasks.filter((t) => t.id !== action.id);
    case "uncomplete":
      return tasks.some((t) => t.id === action.id) ? tasks : [...tasks, action.task];
    case "rename":
      return tasks.map((t) => (t.id === action.id ? { ...t, title: action.title } : t));
    case "delete":
      return tasks.filter((t) => t.id !== action.id);
    default:
      return tasks;
  }
}

export function TodayList({
  tasks,
  subtasks,
  lists,
  labels,
  now,
}: {
  tasks: Task[];
  subtasks: Task[];
  lists: List[];
  labels: Label[];
  now: string;
}) {
  const [optimistic, apply] = useOptimistic(tasks, reduce);
  const [, startTransition] = useTransition();

  const listById = new Map(lists.map((l) => [l.id, l]));
  const labelById = new Map(labels.map((l) => [l.id, l]));

  const subtasksByParent = new Map<string, Task[]>();
  for (const task of subtasks) {
    if (!task.parentId) continue;
    const siblings = subtasksByParent.get(task.parentId);
    if (siblings) siblings.push(task);
    else subtasksByParent.set(task.parentId, [task]);
  }

  /**
   * Apply optimistically, call the action, and report the outcome.
   *
   * `onSuccess` runs only once the write is known to have landed. Announcing
   * success before that is worse than saying nothing: it tells the user their
   * work is saved when it is not.
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

      if (outcome.status === "ok") {
        onSuccess?.();
      } else if (outcome.status === "slow") {
        // Not a failure — the write may still land. Say only what is true.
        toast.warning("Still saving. Reload to see where this ended up.");
      } else {
        toast.error(outcome.message);
      }
    });
  }

  function onComplete(task: Task) {
    run(
      { type: "complete", id: task.id },
      () => completeTask({ id: task.id }),
      "Could not complete that task.",
      () =>
        toast.success(`Completed “${task.title}”`, {
          duration: 5000,
          action: {
            label: "Undo",
            onClick: () =>
              run(
                { type: "uncomplete", id: task.id, task },
                () => uncompleteTask({ id: task.id }),
                "Could not undo that.",
              ),
          },
        }),
    );
  }

  const overdue = optimistic.filter((t) => isOverdue(t.dueDate, now));
  const due = optimistic.filter((t) => isToday(t.dueDate, now));

  if (overdue.length === 0 && due.length === 0) {
    return (
      <EmptyState
        icon={<CalendarCheck className="size-6" strokeWidth={1.9} />}
        title="Nothing due today"
      >
        Everything scheduled for today is done. Add a task above and it lands here.
      </EmptyState>
    );
  }

  const row = (task: Task) => (
    <TaskRow
      key={task.id}
      task={task}
      now={now}
      list={task.listId ? listById.get(task.listId) : undefined}
      labels={task.labelIds.map((id) => labelById.get(id)).filter((l) => l !== undefined)}
      subtasks={subtasksByParent.get(task.id)}
      onComplete={() => onComplete(task)}
      onRename={(title) =>
        run(
          { type: "rename", id: task.id, title },
          () => renameTask({ id: task.id, title }),
          "Could not rename that task.",
        )
      }
      onDelete={() =>
        run(
          { type: "delete", id: task.id },
          () => deleteTask({ id: task.id }),
          "Could not delete that task.",
        )
      }
    />
  );

  return (
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
  );
}
