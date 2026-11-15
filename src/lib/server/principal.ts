import { createHash, randomBytes } from "node:crypto";
import { cookies, headers } from "next/headers";
import { cache } from "react";

import { prisma } from "@/lib/server/prisma";

/**
 * Who is making this request.
 *
 * `user` does not occur yet — Clerk arrives in M7, at which point this gains one
 * branch and nothing else changes. Services take a Principal rather than a user
 * id precisely so that stays true: a guest and a member produce the same query.
 */
export type Principal =
  | { kind: "user"; ownerId: string; timeZone: string }
  | { kind: "guest"; ownerId: string; timeZone: string }
  | { kind: "none" };

/** An owner that exists — i.e. one that can own rows. */
export type OwnedPrincipal = Extract<Principal, { ownerId: string }>;

const GUEST_COOKIE = "nexdo_guest";
const GUEST_COOKIE_MAX_AGE = 60 * 60 * 24 * 400; // 400 days, the browser cap

/**
 * Only the hash is stored. The cookie value is effectively a session token, so a
 * database dump must not yield live sessions.
 */
function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Per-request memoisation. Several components need the principal (and the time
 * zone hanging off it) in one render; without this each would issue its own
 * query.
 */
export const getPrincipal = cache(async (): Promise<Principal> => {
  const token = (await cookies()).get(GUEST_COOKIE)?.value;
  if (!token) return { kind: "none" };

  const owner = await prisma.owner.findUnique({
    where: { guestTokenHash: hashToken(token) },
    select: { id: true, kind: true, timeZone: true },
  });

  // A cookie whose owner was pruned, or forged outright.
  if (!owner) return { kind: "none" };

  return {
    kind: owner.kind === "USER" ? "user" : "guest",
    ownerId: owner.id,
    timeZone: owner.timeZone,
  };
});

/**
 * Whether to mark the guest cookie `Secure`.
 *
 * Not `NODE_ENV === "production"`: `next start` runs in production mode over
 * plain http locally, and Safari silently refuses to store a Secure cookie on
 * an insecure origin — so the guest is lost on every reload while Chromium,
 * which exempts localhost, works fine. Deciding from the actual request keeps
 * Secure on for any real deployment and off only for loopback http.
 */
async function isSecureRequest(): Promise<boolean> {
  const h = await headers();
  const proto = h.get("x-forwarded-proto");
  if (proto) return proto.split(",")[0].trim() === "https";

  const host = h.get("host") ?? "";
  const isLoopback = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(host);
  return !isLoopback;
}

/**
 * Resolve the principal, minting a guest owner if there isn't one.
 *
 * Deliberately only callable from a mutation: a cookie cannot be set from a
 * Server Component, and that constraint is load-bearing rather than annoying.
 * It forces owner creation to the first write, so a crawler that only ever GETs
 * the page writes nothing.
 */
export async function ensureOwner(timeZone: string): Promise<OwnedPrincipal> {
  const existing = await getPrincipal();
  if (existing.kind !== "none") return existing;

  const token = randomBytes(16).toString("base64url"); // 128 bits
  const owner = await prisma.owner.create({
    data: { kind: "GUEST", guestTokenHash: hashToken(token), timeZone },
    select: { id: true, timeZone: true },
  });

  (await cookies()).set(GUEST_COOKIE, token, {
    httpOnly: true,
    secure: await isSecureRequest(),
    sameSite: "lax",
    path: "/",
    maxAge: GUEST_COOKIE_MAX_AGE,
  });

  return { kind: "guest", ownerId: owner.id, timeZone: owner.timeZone };
}

/** Narrow a principal or reject. Every action starts with this. */
export function requireOwner(principal: Principal): OwnedPrincipal {
  if (principal.kind === "none") throw new Error("unauthorized");
  return principal;
}

export type Capability =
  | "task:create"
  | "task:update"
  | "task:complete"
  | "task:delete"
  | "list:create"
  | "label:create"
  | "task:repeat"
  | "search";

/**
 * Empty until M7. The call sites exist now so that gating guests out of lists,
 * labels, recurrence and search is a change to this list rather than an edit to
 * every action.
 */
const GUEST_DENIED: readonly Capability[] = [];

export function assertCan(principal: Principal, capability: Capability): void {
  if (principal.kind === "none") throw new Error("unauthorized");
  if (principal.kind === "guest" && GUEST_DENIED.includes(capability)) {
    throw new Error(`sign in to use ${capability}`);
  }
}
