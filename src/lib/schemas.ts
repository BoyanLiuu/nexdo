import { z } from "zod";

/**
 * One schema per action payload, shared by the form and the server. A Server
 * Action is a public endpoint — anything arriving here is untrusted, including
 * when it came from our own form a moment ago. The capture box parses in the
 * browser, so these fields are *especially* untrusted: they are whatever the
 * client decided they were.
 */

/** Rejects a stray timestamp or a malformed date before it reaches the column. */
export const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "expected a calendar date as YYYY-MM-DD");

export const isoTime = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "expected HH:MM");

/**
 * An IANA zone from the browser. Validated by asking the platform rather than
 * by regex, since the list changes and a wrong zone silently shifts every date.
 */
export const timeZone = z.string().refine(
  (tz) => {
    try {
      new Intl.DateTimeFormat("en", { timeZone: tz });
      return true;
    } catch {
      return false;
    }
  },
  { message: "not a recognised IANA time zone" },
);

export const taskId = z.string().min(1).max(64);

/** 1 = highest, 4 = none. */
export const priority = z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]);

/** One task as the capture box parsed it. */
export const newTaskSchema = z.object({
  /**
   * Minted by the client so the optimistic row and the stored row are the same
   * row. `@default(cuid())` is only a default; supplying one lets the UI act on
   * a task — complete it, open it, delete it — before the insert has landed,
   * which is impossible if the id arrives afterwards.
   *
   * Safe to accept: authorization is the `ownerId` filter, so a chosen id grants
   * nothing. A collision fails the insert, which surfaces as an error.
   */
  id: taskId.optional(),
  /** Minted client-side too, so the optimistic row sorts where the real one will. */
  position: z.string().min(1).max(200).optional(),
  title: z.string().trim().min(1, "a task needs a title").max(500),
  dueDate: isoDate.nullish(),
  dueTime: isoTime.nullish(),
  priority: priority.default(4),
  /** From a `#list` token, or the current list view. Validated for ownership
   *  by the service — a parsed id is still client input. */
  listId: z.string().min(1).max(64).nullish(),
  labelIds: z.array(z.string().min(1).max(64)).max(20).default([]),
});

export const createTasksSchema = z.object({
  /** A pasted block becomes several; one line becomes one. Same path either way. */
  tasks: z.array(newTaskSchema).min(1, "a task needs a title").max(100),
  /** Sent on every create so a brand-new guest's owner row gets the right zone. */
  timeZone: timeZone,
});

export const renameTaskSchema = z.object({
  id: taskId,
  title: z.string().trim().min(1, "a task needs a title").max(500),
});

export const taskIdSchema = z.object({ id: taskId });

export type NewTask = z.infer<typeof newTaskSchema>;

// ── M4 ──────────────────────────────────────────────────────────────────────

export const listColour = z.enum([
  "grass",
  "sky",
  "violet",
  "orange",
  "rose",
  "teal",
  "olive",
  "brown",
  "slate",
]);

const name = z.string().trim().min(1, "a name is needed").max(60);

export const createListSchema = z.object({
  name,
  colour: listColour,
  /** Needed because creating a list may be a visitor's very first write, which
   *  is what mints their owner row — same as creating a task. */
  timeZone,
  /** A single emoji, or nothing. Length-capped rather than pattern-matched. */
  emoji: z.string().trim().max(8).nullish(),
});

export const renameSchema = z.object({ id: taskId, name });
export const archiveListSchema = z.object({ id: taskId, isArchived: z.boolean() });
export const deleteListSchema = z.object({ id: taskId, keepTasks: z.boolean() });
export const createLabelSchema = z.object({ name, colour: listColour, timeZone });

/** Every field optional: the detail panel submits only what changed. */
export const updateTaskSchema = z.object({
  id: taskId,
  title: z.string().trim().min(1, "a task needs a title").max(500).optional(),
  notes: z.string().max(10_000).optional(),
  dueDate: isoDate.nullish(),
  dueTime: isoTime.nullish(),
  priority: priority.optional(),
  listId: taskId.nullish(),
});

export const setLabelsSchema = z.object({
  id: taskId,
  labelIds: z.array(taskId).max(20),
});

export const createSubtaskSchema = z.object({
  parentId: taskId,
  title: z.string().trim().min(1, "a subtask needs a title").max(500),
});

/** A reorder sends the new key, computed on the client from its neighbours. */
export const moveSchema = z.object({ id: taskId, position: z.string().min(1).max(200) });

export const searchSchema = z.object({ q: z.string().trim().min(2).max(100) });

// ── M5 ──────────────────────────────────────────────────────────────────────

/** Capped so a rule cannot be used to schedule something a century out. */
const interval = z.number().int().min(1).max(99);

/**
 * The repeat rule, and the only definition of it. `Repeat` is inferred from
 * this, the editor's resolver uses it, the action validates with it, and the
 * service re-parses the JSON column through it — a `Json` column is untyped
 * storage, so a row written by an older build or by hand is untrusted input
 * like anything else.
 */
export const repeatSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("daily"), interval }),
  z.object({ kind: z.literal("weekdays") }),
  z.object({
    kind: z.literal("weekly"),
    interval,
    weekdays: z.array(z.number().int().min(0).max(6)).nonempty("pick at least one day").max(7),
  }),
  z.object({ kind: z.literal("monthly"), interval, day: z.number().int().min(1).max(31) }),
  z.object({ kind: z.literal("afterCompletion"), days: z.number().int().min(1).max(365) }),
]);

export type Repeat = z.infer<typeof repeatSchema>;
export type RepeatKind = Repeat["kind"];

/** `null` clears the rule, which is how a repeating task stops repeating. */
export const setRepeatSchema = z.object({ id: taskId, repeat: repeatSchema.nullable() });
