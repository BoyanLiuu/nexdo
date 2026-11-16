import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";

import { claimGuest } from "@/lib/server/claim-service";
import { clearGuestCookie, readGuestToken } from "@/lib/server/principal";
import { timeZone as timeZoneSchema } from "@/lib/schemas";

/**
 * Where sign-in lands, so the claim happens on the first authenticated request.
 *
 * A Route Handler rather than anything else because this is the only kind of
 * place that can do both halves of the job: write to the database *and* clear
 * the guest cookie. A Server Component cannot set cookies at all, and running
 * it in `proxy.ts` would mean a database round trip on every request in the app
 * to serve a case that happens once per sign-in.
 *
 * Clerk is pointed here by `NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL`.
 * The handler is deliberately forgiving: any outcome, including a failure,
 * redirects to the app rather than showing an error page. Someone who has just
 * signed in should land in their task list; a claim that did not happen is
 * recoverable on the next sign-in, and their guest work is still behind the
 * cookie until one succeeds.
 */

export async function GET(request: Request) {
  const { userId } = await auth();
  const home = new URL("/", request.url);

  // Not signed in: nothing to claim. Send them to sign-in rather than the app,
  // because arriving here unauthenticated means the redirect fired early.
  if (!userId) return NextResponse.redirect(new URL("/sign-in", request.url));

  // The browser's zone, forwarded by the client that sent them here. Only used
  // when this sign-in creates the account row, and only as a starting value —
  // a guest being promoted keeps the zone recorded at their first write.
  const requested = new URL(request.url).searchParams.get("tz");
  const parsed = timeZoneSchema.safeParse(requested);
  const zone = parsed.success ? parsed.data : "UTC";

  try {
    const outcome = await claimGuest(userId, await readGuestToken(), zone);

    if (outcome.kind === "merged" || outcome.kind === "promoted") {
      // The cookie has either become an account's own token or been consumed.
      // Either way it should not survive a sign-out and resurrect a guest.
      await clearGuestCookie();
    }

    if (outcome.kind === "merged") {
      // Surfaced to the user, because silently moving someone's tasks into an
      // account that already had tasks is the kind of thing they should be told
      // about and able to check.
      home.searchParams.set("merged", String(outcome.movedTasks));
    }
  } catch (error) {
    // Logged rather than shown. The next sign-in tries again, and until then
    // the guest work is still reachable behind its cookie.
    console.error("Claim failed:", error);
  }

  return NextResponse.redirect(home);
}
