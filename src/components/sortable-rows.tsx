"use client";

import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { useId, type ReactNode } from "react";

import type { Task } from "@/lib/types";

/**
 * Drag-to-reorder, with a keyboard equivalent.
 *
 * `KeyboardSensor` is not a nicety — it is the whole reason dnd-kit is here
 * rather than HTML5 drag events. Space picks a row up, arrows move it, space
 * drops it, and dnd-kit announces each step to assistive tech. A drag-only
 * implementation would make manual ordering unreachable without a mouse.
 *
 * Movement is locked to the vertical axis: these are single-column lists, and
 * horizontal freedom only makes a drag feel imprecise.
 */

export function SortableRows({
  tasks,
  onMove,
  children,
}: {
  tasks: Task[];
  /** Called with the moved task and its new index within the group. */
  onMove: (taskId: string, fromIndex: number, toIndex: number) => void;
  children: (renderProps: {
    task: Task;
    dragHandle: React.HTMLAttributes<HTMLButtonElement>;
    style: React.CSSProperties;
    isDragging: boolean;
  }) => ReactNode;
}) {
  // dnd-kit derives its `aria-describedby` ids from a module-level counter, which
  // starts at a different value on the server (which has rendered other lists
  // already) than in a fresh client — a hydration mismatch logged as an error on
  // every page with a sortable list. A stable id from React fixes it at source.
  const dndId = useId();

  const sensors = useSensors(
    // A small distance threshold so a click on the handle is still a click.
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const from = tasks.findIndex((t) => t.id === active.id);
    const to = tasks.findIndex((t) => t.id === over.id);
    if (from === -1 || to === -1) return;

    onMove(String(active.id), from, to);
  }

  return (
    <DndContext
      id={dndId}
      sensors={sensors}
      collisionDetection={closestCenter}
      modifiers={[restrictToVerticalAxis]}
      onDragEnd={handleDragEnd}
    >
      <SortableContext items={tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
        {tasks.map((task) => (
          <SortableRow key={task.id} task={task}>
            {children}
          </SortableRow>
        ))}
      </SortableContext>
    </DndContext>
  );
}

function SortableRow({
  task,
  children,
}: {
  task: Task;
  children: (renderProps: {
    task: Task;
    dragHandle: React.HTMLAttributes<HTMLButtonElement>;
    style: React.CSSProperties;
    isDragging: boolean;
  }) => ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
  });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: transform ? `translate3d(0,${transform.y}px,0)` : undefined, transition }}
    >
      {children({
        task,
        dragHandle: { ...attributes, ...listeners } as React.HTMLAttributes<HTMLButtonElement>,
        style: { opacity: isDragging ? 0.4 : undefined },
        isDragging,
      })}
    </div>
  );
}
