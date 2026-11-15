import { z } from "zod";

/**
 * One schema per action payload, shared by the form and the server. A Server
 * Action is a public endpoint — anything arriving here is untrusted, including
 * when it came from our own form a moment ago.
 */

/** Rejects a stray timestamp or a malformed date before it reaches the column. */
export const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "expected a calendar date as YYYY-MM-DD");

export const isoTime = z.string().regex(/^\d{2}:\d{2}$/, "expected HH:MM");

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

export const createTaskSchema = z.object({
  title: z.string().trim().min(1, "a task needs a title").max(500),
  /** Sent on every create so a brand-new guest's owner row gets the right zone. */
  timeZone: timeZone,
  /**
   * The view's own date. Capturing from Today dates the task today — as Todoist
   * does — rather than dropping it into Inbox where the user isn't looking.
   * Omitted means undated, which is what Inbox will send in M3.
   */
  dueDate: isoDate.nullish(),
});

export const renameTaskSchema = z.object({
  id: taskId,
  title: z.string().trim().min(1, "a task needs a title").max(500),
});

export const taskIdSchema = z.object({ id: taskId });

export type CreateTaskInput = z.infer<typeof createTaskSchema>;
