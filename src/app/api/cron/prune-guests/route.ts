import { NextResponse } from "next/server";

import { prisma } from "@/lib/server/prisma";

/**
 * Delete guests who never came back.
 *
 * A guest owner is created on someone's first write and never asks for
 * anything, so the table accumulates rows for people who tried the app once.
 * Without this they stay for ever, holding tasks nobody can reach: the only key
 * to a guest is a cookie, so once it is gone the row is unreachable by anyone,
 * including its owner.
 *
 * Three conditions, and each one matters:
 *
 *   kind: GUEST        — never touch an account
 *   claimedAt: null    — never touch a guest a sign-in already consumed
 *   lastSeenAt old     — never touch someone still using the app
 *
 * `lastSeenAt` is touched on *mutation*, not on read, which is what makes this
 * safe: a crawler loading the page cannot keep a dead guest alive, and someone
 * who actually uses the app cannot be pruned while they do.
 *
 * Tasks, lists and labels go with the owner through `onDelete: Cascade`, so
 * this is one statement rather than a careful ordering of four.
 */

/** Long enough that "I'll finish this tomorrow" is never punished. */
const PRUNE_AFTER_DAYS = 30;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;

  // Fail closed. A missing secret is a misconfiguration, and the wrong response
  // to it is to delete rows for anyone who finds the URL.
  if (!secret) {
    console.error("CRON_SECRET is not set; refusing to prune.");
    return NextResponse.json({ error: "not configured" }, { status: 503 });
  }

  // Vercel Cron sends the secret as a bearer token. Compared in full rather
  // than by prefix, and nothing about the failure says which part was wrong.
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const cutoff = new Date(Date.now() - PRUNE_AFTER_DAYS * 24 * 60 * 60 * 1000);

  const { count } = await prisma.owner.deleteMany({
    where: { kind: "GUEST", claimedAt: null, lastSeenAt: { lt: cutoff } },
  });

  // Logged because this is the only record that it ran: there is no user to tell
  // and nothing in the UI changes.
  console.log(`Pruned ${count} abandoned guest owner(s) last seen before ${cutoff.toISOString()}.`);

  return NextResponse.json({ pruned: count, cutoff: cutoff.toISOString() });
}
