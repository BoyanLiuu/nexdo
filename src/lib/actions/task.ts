"use server";

import { revalidatePath } from "next/cache";

import { fail, ok, type ActionResult } from "@/lib/actions/result";
import {
  createSubtaskSchema,
  createTasksSchema,
  moveSchema,
  renameTaskSchema,
  setLabelsSchema,
  setRepeatSchema,
  taskIdSchema,
  updateTaskSchema,
} from "@/lib/schemas";
import {
  assertCan,
  ensureOwner,
  getPrincipal,
  type Capability,
  type OwnedPrincipal,
} from "@/lib/server/principal";
import * as taskService from "@/lib/server/task-service";

/**
 * Invalidate every view, not just the one the user is looking at.
 *
 * `revalidatePath("/")` only invalidates the Today route, so adding a task
 * dated Friday and then clicking Upcoming served a cached payload that predated
 * it. Any task mutation can change what Today, Upcoming, Inbox and Completed
 * each show — and all four counts in the rail — so the whole tree under the root
 * layout goes.
 */
function revalidateViews() {
  revalidatePath("/", "layout");
}

/**
 * Every action does the same four things in the same order:
 *
 *   1. Zod-parse the input            — is the shape valid?
 *   2. resolve the principal          — who is this?
 *   3. assertCan                      — is this capability allowed for them?
 *   4. call the service, revalidate   — the service owns the owner filter
 *
 * A Server Action is a public HTTP endpoint, reachable with a crafted request
 * whether or not our UI offers the button. None of these steps can be skipped on
 * the grounds that the client already checked.
 *
 * Failures come back as values, not exceptions — see result.ts for why.
 */

/** Steps 1–3 for an action that operates on an existing row. */
async function authorize(
  input: unknown,
  capability: Capability,
): Promise<{ principal: OwnedPrincipal; id: string } | { error: string }> {
  const parsed = taskIdSchema.safeParse(input);
  if (!parsed.success) return { error: "That task reference was not valid." };

  const principal = await getPrincipal();
  if (principal.kind === "none")
    return { error: "Add a task first — there is nothing to change yet." };

  try {
    assertCan(principal, capability);
  } catch {
    return { error: "Sign in to do that." };
  }

  return { principal, id: parsed.data.id };
}

export async function createTasks(input: unknown): Promise<ActionResult> {
  const parsed = createTasksSchema.safeParse(input);
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "That task could not be added.");
  }

  const { tasks, timeZone } = parsed.data;

  // The one action that may mint an owner: a cookie can only be set from here,
  // never from a Server Component.
  const principal = await ensureOwner(timeZone);
  assertCan(principal, "task:create");

  await taskService.createTasks(principal, tasks);

  revalidateViews();
  return ok();
}

export async function completeTask(input: unknown): Promise<ActionResult> {
  const auth = await authorize(input, "task:complete");
  if ("error" in auth) return fail(auth.error);

  await taskService.completeTask(auth.principal, auth.id);
  revalidateViews();
  return ok();
}

/** Advance a repeating task without recording that it was done. */
export async function skipOccurrence(input: unknown): Promise<ActionResult> {
  const auth = await authorize(input, "task:repeat");
  if ("error" in auth) return fail(auth.error);

  await taskService.skipOccurrence(auth.principal, auth.id);
  revalidateViews();
  return ok();
}

export async function setRepeat(input: unknown): Promise<ActionResult> {
  const parsed = setRepeatSchema.safeParse(input);
  if (!parsed.success)
    return fail(parsed.error.issues[0]?.message ?? "That repeat rule could not be saved.");

  const principal = await getPrincipal();
  if (principal.kind === "none") return fail("Nothing to change yet.");
  try {
    assertCan(principal, "task:repeat");
  } catch {
    return fail("Sign in to use repeating tasks.");
  }

  await taskService.setRepeat(principal, parsed.data.id, parsed.data.repeat);
  revalidateViews();
  return ok();
}

export async function uncompleteTask(input: unknown): Promise<ActionResult> {
  const auth = await authorize(input, "task:complete");
  if ("error" in auth) return fail(auth.error);

  await taskService.uncompleteTask(auth.principal, auth.id);
  revalidateViews();
  return ok();
}

export async function deleteTask(input: unknown): Promise<ActionResult> {
  const auth = await authorize(input, "task:delete");
  if ("error" in auth) return fail(auth.error);

  await taskService.deleteTask(auth.principal, auth.id);
  revalidateViews();
  return ok();
}

export async function renameTask(input: unknown): Promise<ActionResult> {
  const parsed = renameTaskSchema.safeParse(input);
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "That title could not be saved.");
  }

  const principal = await getPrincipal();
  if (principal.kind === "none") return fail("Add a task first.");
  assertCan(principal, "task:update");

  await taskService.renameTask(principal, parsed.data.id, parsed.data.title);
  revalidateViews();
  return ok();
}

// ── M4 ──────────────────────────────────────────────────────────────────────

/** The detail panel sends only the fields it changed. */
export async function updateTask(input: unknown): Promise<ActionResult> {
  const parsed = updateTaskSchema.safeParse(input);
  if (!parsed.success)
    return fail(parsed.error.issues[0]?.message ?? "That change could not be saved.");

  const principal = await getPrincipal();
  if (principal.kind === "none") return fail("Add a task first.");
  assertCan(principal, "task:update");

  const { id, ...fields } = parsed.data;
  try {
    await taskService.updateTask(principal, id, fields);
  } catch {
    // The service rejects a listId belonging to someone else.
    return fail("That list is not available.");
  }
  revalidateViews();
  return ok();
}

export async function setTaskLabels(input: unknown): Promise<ActionResult> {
  const parsed = setLabelsSchema.safeParse(input);
  if (!parsed.success) return fail("Those labels could not be saved.");

  const principal = await getPrincipal();
  if (principal.kind === "none") return fail("Add a task first.");
  assertCan(principal, "task:update");

  await taskService.setTaskLabels(principal, parsed.data.id, parsed.data.labelIds);
  revalidateViews();
  return ok();
}

export async function createSubtask(input: unknown): Promise<ActionResult> {
  const parsed = createSubtaskSchema.safeParse(input);
  if (!parsed.success)
    return fail(parsed.error.issues[0]?.message ?? "That subtask could not be added.");

  const principal = await getPrincipal();
  if (principal.kind === "none") return fail("Add a task first.");
  assertCan(principal, "task:create");

  await taskService.createSubtask(principal, parsed.data.parentId, parsed.data.title);
  revalidateViews();
  return ok();
}

/** The new sort key is computed on the client from the drop neighbours. */
export async function moveTask(input: unknown): Promise<ActionResult> {
  const parsed = moveSchema.safeParse(input);
  if (!parsed.success) return fail("That task could not be moved.");

  const principal = await getPrincipal();
  if (principal.kind === "none") return fail("Add a task first.");
  assertCan(principal, "task:update");

  await taskService.moveTask(principal, parsed.data.id, parsed.data.position);
  revalidateViews();
  return ok();
}
