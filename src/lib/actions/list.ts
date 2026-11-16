"use server";

import { revalidatePath } from "next/cache";

import { fail, ok, type ActionResult } from "@/lib/actions/result";
import {
  archiveListSchema,
  createLabelSchema,
  createListSchema,
  deleteListSchema,
  moveSchema,
  renameSchema,
  taskIdSchema,
} from "@/lib/schemas";
import * as lists from "@/lib/server/list-service";
import {
  assertCan,
  ensureOwner,
  getPrincipal,
  type Capability,
  type OwnedPrincipal,
} from "@/lib/server/principal";

/**
 * For actions that change something that already exists. An owner must exist,
 * because there is nothing to rename or delete otherwise.
 */
async function authorize(
  capability: Capability,
): Promise<{ principal: OwnedPrincipal } | { error: string }> {
  const principal = await getPrincipal();
  if (principal.kind === "none") return { error: "Nothing to change yet." };
  try {
    assertCan(principal, capability);
  } catch {
    return { error: "Sign in to do that." };
  }
  return { principal };
}

/**
 * For actions that *create* something.
 *
 * Creating a list can be a visitor's first write, so it has to be able to mint
 * the owner row — exactly like creating a task. Requiring an existing owner here
 * meant a brand-new visitor clicking "+" beside Lists got nothing at all, with
 * the failure swallowed. Identity bootstrapping belongs on every entry point
 * that creates owned data, not only the first one that happened to be built.
 */
async function authorizeCreate(
  capability: Capability,
  timeZone: string,
): Promise<{ principal: OwnedPrincipal } | { error: string }> {
  const principal = await ensureOwner(timeZone);
  try {
    assertCan(principal, capability);
  } catch {
    return { error: "Sign in to do that." };
  }
  return { principal };
}

function revalidateViews() {
  revalidatePath("/", "layout");
}

export async function createList(input: unknown): Promise<ActionResult> {
  const parsed = createListSchema.safeParse(input);
  if (!parsed.success)
    return fail(parsed.error.issues[0]?.message ?? "That list could not be added.");

  const auth = await authorizeCreate("list:create", parsed.data.timeZone);
  if ("error" in auth) return fail(auth.error);

  await lists.createList(
    auth.principal,
    parsed.data.name,
    parsed.data.colour,
    parsed.data.emoji ?? null,
    parsed.data.id,
    parsed.data.position,
  );
  revalidateViews();
  return ok();
}

export async function renameList(input: unknown): Promise<ActionResult> {
  const parsed = renameSchema.safeParse(input);
  if (!parsed.success) return fail("That name could not be saved.");

  const auth = await authorize("list:create");
  if ("error" in auth) return fail(auth.error);

  await lists.renameList(auth.principal, parsed.data.id, parsed.data.name);
  revalidateViews();
  return ok();
}

export async function setListArchived(input: unknown): Promise<ActionResult> {
  const parsed = archiveListSchema.safeParse(input);
  if (!parsed.success) return fail("That list could not be changed.");

  const auth = await authorize("list:create");
  if ("error" in auth) return fail(auth.error);

  await lists.setListArchived(auth.principal, parsed.data.id, parsed.data.isArchived);
  revalidateViews();
  return ok();
}

export async function moveList(input: unknown): Promise<ActionResult> {
  const parsed = moveSchema.safeParse(input);
  if (!parsed.success) return fail("That list could not be moved.");

  const auth = await authorize("list:create");
  if ("error" in auth) return fail(auth.error);

  await lists.moveList(auth.principal, parsed.data.id, parsed.data.position);
  revalidateViews();
  return ok();
}

/** `keepTasks` moves the list's tasks to Inbox; otherwise they go with it. */
export async function deleteList(input: unknown): Promise<ActionResult> {
  const parsed = deleteListSchema.safeParse(input);
  if (!parsed.success) return fail("That list could not be deleted.");

  const auth = await authorize("list:create");
  if ("error" in auth) return fail(auth.error);

  await lists.deleteList(auth.principal, parsed.data.id, parsed.data.keepTasks);
  revalidateViews();
  return ok();
}

/** Read-only, used by the delete prompt to say how many tasks are at stake. */
export async function countListTasks(input: unknown): Promise<number> {
  const parsed = taskIdSchema.safeParse(input);
  if (!parsed.success) return 0;

  const principal = await getPrincipal();
  if (principal.kind === "none") return 0;

  return lists.openTaskCount(principal, parsed.data.id);
}

export async function createLabel(input: unknown): Promise<ActionResult> {
  const parsed = createLabelSchema.safeParse(input);
  if (!parsed.success)
    return fail(parsed.error.issues[0]?.message ?? "That label could not be added.");

  const auth = await authorizeCreate("label:create", parsed.data.timeZone);
  if ("error" in auth) return fail(auth.error);

  await lists.createLabel(auth.principal, parsed.data.name, parsed.data.colour, parsed.data.id);
  revalidateViews();
  return ok();
}

export async function renameLabel(input: unknown): Promise<ActionResult> {
  const parsed = renameSchema.safeParse(input);
  if (!parsed.success) return fail("That name could not be saved.");

  const auth = await authorize("label:create");
  if ("error" in auth) return fail(auth.error);

  await lists.renameLabel(auth.principal, parsed.data.id, parsed.data.name);
  revalidateViews();
  return ok();
}

export async function deleteLabel(input: unknown): Promise<ActionResult> {
  const parsed = taskIdSchema.safeParse(input);
  if (!parsed.success) return fail("That label could not be deleted.");

  const auth = await authorize("label:create");
  if ("error" in auth) return fail(auth.error);

  await lists.deleteLabel(auth.principal, parsed.data.id);
  revalidateViews();
  return ok();
}
