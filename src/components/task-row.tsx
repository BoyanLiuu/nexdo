import { LIST_DOT } from "@/lib/colours";
import { formatDue, formatTime, isOverdue } from "@/lib/dates";
import type { Label, List, Priority, Task } from "@/lib/types";

const PRIORITY_STYLE: Record<Exclude<Priority, 4>, string> = {
  1: "bg-ink text-card-paper",
  2: "shadow-[inset_0_0_0_1.5px_var(--color-ink)] text-ink",
  3: "shadow-[inset_0_0_0_1.5px_var(--color-hair-strong)] text-ink-2",
};

function PriorityFlag({ priority }: { priority: Priority }) {
  if (priority === 4) return null;
  return (
    <span
      className={`inline-grid size-5 flex-none place-items-center rounded-[5px] text-[11.5px] font-[750] ${PRIORITY_STYLE[priority]}`}
      title={`Priority ${priority}`}
    >
      {priority}
    </span>
  );
}

/** Native checkbox styled as the design's `.tick`. No handler in M0 — see IMPLEMENTATION_PLAN.md. */
function Tick({ done, label }: { done: boolean; label: string }) {
  return (
    <input
      type="checkbox"
      defaultChecked={done}
      aria-label={`Complete ${label}`}
      className="tick border-field-edge bg-card-paper hover:border-blue checked:border-blue checked:bg-blue mt-[3px] size-5 appearance-none rounded-[6px] border-[1.5px] transition-colors"
    />
  );
}

export function TaskRow({
  task,
  now,
  list,
  labels,
  subtasks = [],
}: {
  task: Task;
  /**
   * The view's "today", passed in rather than recomputed. A row that derived its
   * own would disagree with the group it sits in across a midnight boundary —
   * and once M3 takes the zone from the owner, a row calling `today()` would
   * silently fall back to the server's zone while the page used the owner's.
   */
  now: string;
  list?: List;
  labels?: Label[];
  subtasks?: Task[];
}) {
  const done = task.completedAt !== null;
  const late = isOverdue(task.dueDate, now) && !done;
  const doneSubtasks = subtasks.filter((s) => s.completedAt !== null).length;

  return (
    <li className="border-hair-soft bg-ground hover:bg-hover focus-within:bg-blue-tint grid grid-cols-[22px_minmax(0,1fr)_auto] items-start gap-x-3 border-b px-2 py-[11px] transition-colors">
      <Tick done={done} label={task.title} />

      <div className="min-w-0">
        <span
          className={`-my-[7px] block py-[7px] text-[15.5px] leading-[1.4] font-[450] wrap-break-word ${
            done ? "text-ink-3 decoration-hair-strong line-through" : "text-ink"
          }`}
        >
          {task.title}
        </span>

        {(task.dueDate || list || labels?.length || task.notes || subtasks.length > 0) && (
          <div className="text-ink-3 mt-1 flex flex-wrap items-center gap-x-3.5 gap-y-[3px] text-[13px] leading-[1.4]">
            {task.dueDate && (
              <span
                className={`inline-flex items-center gap-[5px] whitespace-nowrap ${late ? "text-verm font-semibold" : ""}`}
              >
                {formatDue(task.dueDate, now)}
                {task.dueTime && (
                  <span className="text-ink-2 font-[550]">{formatTime(task.dueTime)}</span>
                )}
              </span>
            )}

            {list && (
              <span className="inline-flex items-center gap-[5px] whitespace-nowrap">
                <span className={`size-[9px] rounded-[2.5px] ${LIST_DOT[list.colour]}`} />
                <span className="text-ink-2">
                  {list.emoji ? `${list.emoji} ` : ""}
                  {list.name}
                </span>
              </span>
            )}

            {labels?.map((l) => (
              <span
                key={l.id}
                className="text-ink-2 inline-flex items-center gap-[5px] whitespace-nowrap"
              >
                @{l.name}
              </span>
            ))}

            {subtasks.length > 0 && (
              <span className="inline-flex items-center gap-[5px] whitespace-nowrap">
                {doneSubtasks}/{subtasks.length}
              </span>
            )}

            {task.notes && <span className="inline-flex items-center gap-[5px]">Notes</span>}
          </div>
        )}
      </div>

      <PriorityFlag priority={task.priority} />
    </li>
  );
}
