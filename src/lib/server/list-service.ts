import type { OwnedPrincipal } from "@/lib/server/principal";
import { prisma } from "@/lib/server/prisma";
import { positionAfter } from "@/lib/ordering";
import type { Label, List, ListColour } from "@/lib/types";

/**
 * Lists and labels. Same rule as tasks: the principal comes first and every
 * query filters on `ownerId`, so a guessed id touches zero rows.
 */

const LIST_SELECT = {
  id: true,
  name: true,
  colour: true,
  emoji: true,
  position: true,
  isArchived: true,
} as const;

export async function listsFor(principal: OwnedPrincipal): Promise<List[]> {
  const rows = await prisma.list.findMany({
    where: { ownerId: principal.ownerId, deletedAt: null },
    select: LIST_SELECT,
    orderBy: { position: "asc" },
  });
  return rows as List[];
}

export async function createList(
  principal: OwnedPrincipal,
  name: string,
  colour: ListColour,
  emoji: string | null,
): Promise<List> {
  const last = await prisma.list.findFirst({
    where: { ownerId: principal.ownerId, deletedAt: null },
    orderBy: { position: "desc" },
    select: { position: true },
  });

  const row = await prisma.list.create({
    data: {
      ownerId: principal.ownerId,
      name,
      colour,
      emoji,
      position: positionAfter(last?.position ?? null),
    },
    select: LIST_SELECT,
  });
  return row as List;
}

export async function renameList(principal: OwnedPrincipal, id: string, name: string) {
  await prisma.list.updateMany({
    where: { id, ownerId: principal.ownerId, deletedAt: null },
    data: { name },
  });
}

export async function setListArchived(principal: OwnedPrincipal, id: string, isArchived: boolean) {
  await prisma.list.updateMany({
    where: { id, ownerId: principal.ownerId, deletedAt: null },
    data: { isArchived },
  });
}

export async function moveList(principal: OwnedPrincipal, id: string, position: string) {
  await prisma.list.updateMany({
    where: { id, ownerId: principal.ownerId, deletedAt: null },
    data: { position },
  });
}

/**
 * Delete a list, and decide what happens to its tasks.
 *
 * One transaction, because a list that is gone while its tasks still point at it
 * is a view that renders a dangling reference. `keepTasks` moves them to Inbox
 * (`listId: null`); otherwise they are soft-deleted alongside it.
 */
export async function deleteList(principal: OwnedPrincipal, id: string, keepTasks: boolean) {
  const owner = { ownerId: principal.ownerId };
  const now = new Date();

  await prisma.$transaction([
    prisma.task.updateMany({
      where: { ...owner, listId: id },
      data: keepTasks ? { listId: null } : { deletedAt: now },
    }),
    prisma.list.updateMany({ where: { ...owner, id }, data: { deletedAt: now } }),
  ]);
}

/** How many open tasks a list holds — shown in the delete prompt. */
export async function openTaskCount(principal: OwnedPrincipal, listId: string): Promise<number> {
  return prisma.task.count({
    where: {
      ownerId: principal.ownerId,
      listId,
      deletedAt: null,
      parentId: null,
      completedAt: null,
    },
  });
}

// ── Labels ──────────────────────────────────────────────────────────────────

export async function labelsFor(principal: OwnedPrincipal): Promise<Label[]> {
  const rows = await prisma.label.findMany({
    where: { ownerId: principal.ownerId, deletedAt: null },
    select: { id: true, name: true, colour: true },
    orderBy: { name: "asc" },
  });
  return rows as Label[];
}

export async function createLabel(
  principal: OwnedPrincipal,
  name: string,
  colour: ListColour,
): Promise<Label> {
  const row = await prisma.label.create({
    data: { ownerId: principal.ownerId, name, colour },
    select: { id: true, name: true, colour: true },
  });
  return row as Label;
}

export async function renameLabel(principal: OwnedPrincipal, id: string, name: string) {
  await prisma.label.updateMany({
    where: { id, ownerId: principal.ownerId, deletedAt: null },
    data: { name },
  });
}

export async function deleteLabel(principal: OwnedPrincipal, id: string) {
  // TaskLabel rows cascade on the label, so the joins go with it.
  await prisma.label.updateMany({
    where: { id, ownerId: principal.ownerId },
    data: { deletedAt: new Date() },
  });
}
