"use server";

import { revalidatePath } from "next/cache";

import { fail, ok, type ActionResult } from "@/lib/actions/result";
import { createTaskSchema, renameTaskSchema, taskIdSchema } from "@/lib/schemas";
import {
  assertCan,
  ensureOwner,
  getPrincipal,
  type Capability,
  type OwnedPrincipal,
} from "@/lib/server/principal";
import * as taskService from "@/lib/server/task-service";

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
  const parsed = createTaskSchema.safeParse(input);
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "That task could not be added.");
  }

  const { title, timeZone, dueDate } = parsed.data;
  const titles = title
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 100);

  if (titles.length === 0) return fail("A task needs a title.");

  // The one action that may mint an owner: a cookie can only be set from here,
  // never from a Server Component.
  const principal = await ensureOwner(timeZone);
  assertCan(principal, "task:create");

  if (titles.length === 1) await taskService.createTask(principal, titles[0], dueDate ?? null);
  else await taskService.createTasks(principal, titles, dueDate ?? null);

  revalidatePath("/");
  return ok();
}

export async function completeTask(input: unknown): Promise<ActionResult> {
  const auth = await authorize(input, "task:complete");
  if ("error" in auth) return fail(auth.error);

  await taskService.completeTask(auth.principal, auth.id);
  revalidatePath("/");
  return ok();
}

export async function uncompleteTask(input: unknown): Promise<ActionResult> {
  const auth = await authorize(input, "task:complete");
  if ("error" in auth) return fail(auth.error);

  await taskService.uncompleteTask(auth.principal, auth.id);
  revalidatePath("/");
  return ok();
}

export async function deleteTask(input: unknown): Promise<ActionResult> {
  const auth = await authorize(input, "task:delete");
  if ("error" in auth) return fail(auth.error);

  await taskService.deleteTask(auth.principal, auth.id);
  revalidatePath("/");
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
  revalidatePath("/");
  return ok();
}
