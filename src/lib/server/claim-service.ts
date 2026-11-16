import { prisma } from "@/lib/server/prisma";
import { guestTokenHash } from "@/lib/server/principal";
import { isOrderKey, positionAfter } from "@/lib/ordering";

/**
 * Turning a guest into a member.
 *
 * Two paths, and which one runs depends on whether this Clerk user already has
 * an `Owner`:
 *
 *   promote  no existing account  ->  the guest row *becomes* the account
 *   merge    account already here ->  the guest's rows move onto it
 *
 * Promote is the common case and the reason the data model points `Task.ownerId`
 * at an internal `Owner` rather than at a Clerk id: it is one `UPDATE` of one
 * row, and **not a single task moves**. A schema keyed on `clerkUserId` would
 * have to rewrite every task a guest had ever created, inside a transaction
 * whose size grows with how much they liked the app before signing up.
 */

export type ClaimOutcome =
  /** Nothing to claim: no guest cookie, or it named nothing. */
  | { kind: "nothing" }
  /** The guest row became the account. No task moved. */
  | { kind: "promoted" }
  /** Signed in with no guest work to bring, so the account row was created. */
  | { kind: "created" }
  /** Tasks moved onto an account that already existed. */
  | { kind: "merged"; movedTasks: number; movedLists: number }
  /** This guest was already claimed — a replay, or two tabs racing. */
  | { kind: "already" };

/**
 * Claim the guest identified by `guestToken` for `clerkUserId`.
 *
 * Idempotent by construction: every path either finds the guest already claimed
 * or sets `claimedAt` inside the same transaction that moves the data, so a
 * replay has nothing left to find. That matters because the trigger is an HTTP
 * request after sign-in, and requests get retried, double-fired by two tabs, and
 * re-sent by someone reloading the redirect.
 */
export async function claimGuest(
  clerkUserId: string,
  guestToken: string | null,
  timeZone: string,
): Promise<ClaimOutcome> {
  // Both lookups at once: they are independent, and this runs on the sign-in
  // path where the user is already waiting on a redirect.
  const [account, guest] = await Promise.all([
    prisma.owner.findUnique({ where: { clerkUserId }, select: { id: true } }),
    guestToken === null
      ? null
      : prisma.owner.findUnique({
          where: { guestTokenHash: guestTokenHash(guestToken) },
          select: { id: true, kind: true, claimedAt: true },
        }),
  ]);

  // One named condition rather than the same three tests read twice: a guest is
  // claimable only if it exists, is still a guest, and has not been consumed.
  const claimable = guest !== null && guest.kind === "GUEST" && guest.claimedAt === null;

  if (!claimable) {
    if (account) return guest?.claimedAt ? { kind: "already" } : { kind: "nothing" };

    // `upsert` rather than `create`: two tabs finishing sign-in together would
    // both find no account and both insert, and the loser hits the unique
    // constraint on `clerkUserId`. This makes the second one a no-op.
    await prisma.owner.upsert({
      where: { clerkUserId },
      create: { kind: "USER", clerkUserId, timeZone, claimedAt: new Date() },
      update: {},
      select: { id: true },
    });
    return { kind: "created" };
  }

  if (!account) return promoteInPlace(guest.id, clerkUserId);
  return mergeInto(account.id, guest.id);
}

/**
 * The guest row becomes the account: one `UPDATE`, no task touched.
 *
 * `claimedAt` is set in the same statement rather than afterwards, so there is
 * no instant where the row is a claimed account that does not say so.
 */
async function promoteInPlace(guestId: string, clerkUserId: string): Promise<ClaimOutcome> {
  const { count } = await prisma.owner.updateMany({
    // `claimedAt: null` in the filter is the idempotency guard: two requests
    // racing means the second matches zero rows rather than overwriting the
    // first's work.
    where: { id: guestId, kind: "GUEST", claimedAt: null },
    // The token hash goes too. It is a session credential, the cookie holding
    // it has just been cleared, and nothing will ever present it again — so
    // keeping a hash of it is storage with no reader and a small liability.
    data: { kind: "USER", clerkUserId, claimedAt: new Date(), guestTokenHash: null },
  });

  return count === 1 ? { kind: "promoted" } : { kind: "already" };
}

/**
 * This Clerk user already had an account, so the guest's rows move onto it.
 *
 * Lists and labels come too, because a task pointing at a list owned by someone
 * else would be invisible — the services filter both on `ownerId`. Positions are
 * regenerated from the end of the destination so the merged rows land after what
 * was already there instead of interleaving by accident.
 */
async function mergeInto(accountId: string, guestId: string): Promise<ClaimOutcome> {
  return prisma.$transaction(async (tx) => {
    // Re-read inside the transaction: the guest may have been claimed between
    // the check above and here.
    const guest = await tx.owner.findFirst({
      where: { id: guestId, kind: "GUEST", claimedAt: null },
      select: { id: true },
    });
    if (!guest) return { kind: "already" } as ClaimOutcome;

    const [lastTask, lastList] = await Promise.all([
      tx.task.findFirst({
        where: { ownerId: accountId },
        orderBy: { position: "desc" },
        select: { position: true },
      }),
      tx.list.findFirst({
        where: { ownerId: accountId },
        orderBy: { position: "desc" },
        select: { position: true },
      }),
    ]);

    const [tasks, lists] = await Promise.all([
      tx.task.findMany({
        where: { ownerId: guestId },
        orderBy: { position: "asc" },
        select: { id: true },
      }),
      tx.list.findMany({
        where: { ownerId: guestId },
        orderBy: { position: "asc" },
        select: { id: true },
      }),
    ]);

    // Sequential rather than `Promise.all`: each key is generated from the
    // previous one, so they have to be handed out in order.
    // Seeded from the destination's last key, or from nothing when that key is
    // a legacy value this cannot extend — which is exactly the failure that
    // made the first merge throw `invalid order key`.
    let taskKey = isOrderKey(lastTask?.position) ? lastTask.position : null;
    for (const task of tasks) {
      taskKey = positionAfter(taskKey);
      await tx.task.update({
        where: { id: task.id },
        data: { ownerId: accountId, position: taskKey },
      });
    }

    let listKey = isOrderKey(lastList?.position) ? lastList.position : null;
    for (const list of lists) {
      listKey = positionAfter(listKey);
      await tx.list.update({
        where: { id: list.id },
        data: { ownerId: accountId, position: listKey },
      });
    }

    // Labels have no position and no uniqueness on (ownerId, name), so this is
    // a plain reassignment — and it means an account that already had a "quick"
    // label ends up with two. Left that way deliberately: silently dropping one
    // would take a label off whichever tasks referenced it, and merging two
    // labels that merely share a name is a guess. Two visible duplicates the
    // user can rename or delete is the honest outcome.
    await tx.label.updateMany({
      where: { ownerId: guestId },
      data: { ownerId: accountId },
    });

    await tx.owner.update({
      where: { id: guestId },
      data: { claimedAt: new Date(), guestTokenHash: null },
    });

    return { kind: "merged", movedTasks: tasks.length, movedLists: lists.length };
  });
}
