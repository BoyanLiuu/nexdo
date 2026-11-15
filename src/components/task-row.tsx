"use client";

import { useEffect, useRef } from "react";
import { GripVertical, PanelRight, Repeat2, Trash2 } from "lucide-react";

import { LIST_DOT } from "@/lib/colours";
import { describeRepeat } from "@/lib/repeat";
import { useSwipeComplete } from "@/lib/use-swipe-complete";
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

export function TaskRow({
  task,
  now,
  list,
  labels,
  subtasks = [],
  onComplete,
  onRename,
  onDelete,
  onOpenDetail,
  dragHandle,
  focused = false,
  tabbable = false,
  editing = false,
  onEditingChange,
  onFocusRequest,
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
  onComplete: () => void;
  onRename: (title: string) => void;
  onDelete: () => void;
  /** Opens the detail panel. Omitted where there is no panel to open. */
  onOpenDetail?: () => void;
  /** Drag handle props from dnd-kit, when the row is sortable. */
  dragHandle?: React.HTMLAttributes<HTMLButtonElement>;
  /** The list's keyboard cursor is on this row: take real DOM focus. */
  focused?: boolean;
  /**
   * In the tab order. Exactly one row is, so Tab enters the list in one stop
   * instead of walking every row — but *some* row has to be, which the first
   * version got wrong: with no cursor set, every row was `-1` and the list was
   * unreachable by keyboard until something else moved focus into it.
   */
  tabbable?: boolean;
  /**
   * Whether this row is being renamed. Owned by the list, because the `E` key
   * arrives there and only one row can be editing at a time — holding it here
   * too would mean mirroring a prop into state in an effect, which is both a
   * second owner and a cascading render.
   */
  editing?: boolean;
  onEditingChange?: (editing: boolean) => void;
  /** Clicking or tabbing to a row moves the list's cursor here. */
  onFocusRequest?: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const row = useRef<HTMLLIElement>(null);

  // Real DOM focus, not a highlight. A screen reader announces the row, and
  // `:focus-visible` styling comes for free — a purely visual cursor would be
  // invisible to assistive tech and unreachable by Tab.
  useEffect(() => {
    if (focused && document.activeElement !== row.current) row.current?.focus();
  }, [focused]);

  const swipe = useSwipeComplete(onComplete);

  const done = task.completedAt !== null;
  const late = isOverdue(task.dueDate, now) && !done;
  const doneSubtasks = subtasks.filter((s) => s.completedAt !== null).length;

  function stopEditing() {
    onEditingChange?.(false);
    // The input is about to unmount; without this, focus lands on the body and
    // the arrow keys stop working until the user clicks something.
    row.current?.focus();
  }

  function commit() {
    const next = input.current?.value.trim() ?? "";
    stopEditing();
    if (next && next !== task.title) onRename(next);
  }

  return (
    <li
      ref={row}
      // A stable hook for tests and for finding rows by id. `li[tabindex]` is
      // not specific enough: Sonner renders its toasts as focusable `li`s too.
      data-task-row={task.id}
      {...swipe.handlers}
      style={
        swipe.offset > 0
          ? // Driven from the finger, so no transition — a transition here would
            // make the row lag behind the touch.
            { transform: `translateX(${swipe.offset}px)` }
          : undefined
      }
      // Roving tabindex: one row is in the tab order and the arrows move which.
      // Putting every row in the tab order would make Tab the slowest way
      // through a long list.
      tabIndex={focused || tabbable ? 0 : -1}
      onFocus={(e) => {
        // Only when the row itself takes focus, not a button inside it —
        // otherwise clicking Delete would also move the cursor.
        if (e.target === e.currentTarget) onFocusRequest?.();
      }}
      aria-label={`${task.title}${task.completedAt ? ", completed" : ""}`}
      className="row-enter group border-hair-soft bg-ground hover:bg-hover focus-within:bg-blue-tint focus-visible:bg-blue-tint focus-visible:outline-blue relative grid grid-cols-[22px_minmax(0,1fr)_auto] items-start gap-x-3 border-b px-2 py-[11px] transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2"
    >
      {dragHandle && (
        <button
          type="button"
          {...dragHandle}
          aria-label={`Reorder ${task.title}`}
          className="text-hair-strong hover:text-ink-3 absolute top-3 -left-4 hidden size-5 cursor-grab place-items-center rounded opacity-0 group-hover:grid group-hover:opacity-100 focus-visible:grid focus-visible:opacity-100 md:block"
        >
          <GripVertical className="size-4" strokeWidth={2} />
        </button>
      )}
      {swipe.offset > 0 && (
        <span
          aria-hidden
          className={`absolute inset-y-0 -left-1 flex items-center text-[12.5px] font-[650] transition-colors ${
            swipe.willComplete ? "text-blue" : "text-ink-3"
          }`}
          style={{ transform: `translateX(-${swipe.offset}px)` }}
        >
          {done ? "Reopen" : "Complete"}
        </span>
      )}

      <input
        type="checkbox"
        checked={done}
        onChange={onComplete}
        // The control reopens a done task, so saying "Complete" would be wrong
        // for exactly the rows where the distinction matters.
        aria-label={`${done ? "Reopen" : "Complete"} ${task.title}`}
        className="tick border-field-edge bg-card-paper hover:border-blue checked:border-blue checked:bg-blue mt-[3px] size-5 appearance-none rounded-[6px] border-[1.5px] transition-colors"
      />

      <div className="min-w-0">
        {editing ? (
          <input
            ref={input}
            autoFocus
            defaultValue={task.title}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === "Enter") commit();
              if (e.key === "Escape") stopEditing();
            }}
            aria-label="Task title"
            className="text-ink caret-blue focus-visible:outline-blue -my-[7px] block w-full bg-transparent py-[7px] text-[15.5px] leading-[1.4] font-[450] outline-none"
          />
        ) : (
          <button
            type="button"
            onClick={() => onEditingChange?.(true)}
            className="text-ink -my-[7px] block w-full cursor-text py-[7px] text-left text-[15.5px] leading-[1.4] font-[450] wrap-break-word"
          >
            {task.title}
          </button>
        )}

        {(task.dueDate ||
          list ||
          labels?.length ||
          task.notes ||
          task.repeat ||
          subtasks.length > 0) && (
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

            {task.repeat && (
              <span
                className="inline-flex items-center gap-[5px] whitespace-nowrap"
                title={describeRepeat(task.repeat)}
              >
                <Repeat2 className="size-3.5" strokeWidth={2} />
                <span className="sr-only">{describeRepeat(task.repeat)}</span>
              </span>
            )}

            {subtasks.length > 0 && (
              <span className="inline-flex items-center gap-[5px] whitespace-nowrap">
                {doneSubtasks}/{subtasks.length}
              </span>
            )}
          </div>
        )}
      </div>

      <div className="flex items-center gap-1.5">
        <PriorityFlag priority={task.priority} />
        {onOpenDetail && (
          <button
            type="button"
            onClick={onOpenDetail}
            aria-label={`Open details for ${task.title}`}
            className="text-ink-3 hover:bg-hover hover:text-ink grid size-7 place-items-center rounded opacity-0 transition group-hover:opacity-100 focus-visible:opacity-100"
          >
            <PanelRight className="size-4" strokeWidth={1.9} />
          </button>
        )}
        <button
          type="button"
          onClick={onDelete}
          aria-label={`Delete ${task.title}`}
          className="text-ink-3 hover:bg-verm-tint hover:text-verm grid size-7 place-items-center rounded opacity-0 transition group-hover:opacity-100 focus-visible:opacity-100"
        >
          <Trash2 className="size-4" strokeWidth={1.9} />
        </button>
      </div>
    </li>
  );
}
