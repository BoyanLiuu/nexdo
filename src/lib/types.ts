/**
 * Field names and types mirror the Prisma schema in
 * docs/project-idea/33-todo-list/ARCHITECTURE.md §6, so M1 can swap the
 * fixtures import for a service call without reshaping components.
 */

export type ListColour =
  "grass" | "sky" | "violet" | "orange" | "rose" | "teal" | "olive" | "brown" | "slate";

/** 1 = highest, 4 = none. Matches `Task.priority` default of 4. */
export type Priority = 1 | 2 | 3 | 4;

export type List = {
  id: string;
  name: string;
  colour: ListColour;
  emoji: string | null;
  position: string;
  isArchived: boolean;
};

export type Label = {
  id: string;
  name: string;
  colour: ListColour;
};

export type Task = {
  id: string;
  listId: string | null;
  parentId: string | null;
  title: string;
  notes: string;
  /** ISO calendar date, `YYYY-MM-DD`. Never a timestamp — see ARCHITECTURE.md §7. */
  dueDate: string | null;
  /** `HH:MM`, 24-hour. */
  dueTime: string | null;
  priority: Priority;
  position: string;
  labelIds: string[];
  completedAt: string | null;
};
