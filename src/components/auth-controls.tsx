"use client";

import { SignInButton, SignUpButton, UserButton, useAuth } from "@clerk/nextjs";
import { LogIn } from "lucide-react";

/**
 * Sign in, or the account menu.
 *
 * A client component so it can carry the browser's time zone into the claim
 * redirect. Only the browser knows the zone, and a brand-new account created by
 * this sign-in has nothing else to derive it from — a guest being promoted keeps
 * the zone recorded at their first write, but someone signing up on a fresh
 * browser would otherwise land on UTC and see the wrong day.
 *
 * `useAuth` rather than `<SignedIn>` / `<SignedOut>`: those render both branches
 * and hide one, which flashes the wrong control for a frame. `isLoaded` lets
 * this render nothing until Clerk knows, so the rail does not flicker between a
 * sign-in button and an avatar on every load.
 */
export function AuthControls() {
  const { isLoaded, isSignedIn } = useAuth();

  if (!isLoaded) {
    // A fixed-height placeholder, so the rail does not jump when this resolves.
    return <div aria-hidden className="h-9" />;
  }

  if (isSignedIn) {
    return (
      <div className="flex h-9 items-center gap-2.5 px-1.5">
        {/* Clerk 7 dropped `afterSignOutUrl` from this component — where
            sign-out lands is an instance setting now, not a prop. Worth setting
            there to `/`, because this app works without an account. */}
        <UserButton appearance={{ elements: { userButtonAvatarBox: "size-7" } }} />
        <span className="text-ink-2 truncate text-[13px] font-[550]">Your account</span>
      </div>
    );
  }

  const claimUrl = `/auth/claim?tz=${encodeURIComponent(
    Intl.DateTimeFormat().resolvedOptions().timeZone,
  )}`;

  return (
    <div className="flex flex-col gap-1">
      <SignInButton mode="modal" forceRedirectUrl={claimUrl} signUpForceRedirectUrl={claimUrl}>
        <button
          type="button"
          className="rounded-cell text-ink-2 hover:bg-rail-hover hover:text-ink flex h-9 items-center gap-2.5 px-2.5 text-[14.5px] font-[550] transition-colors"
        >
          <LogIn className="size-4 flex-none" strokeWidth={1.9} />
          Sign in
        </button>
      </SignInButton>

      <SignUpButton mode="modal" forceRedirectUrl={claimUrl} signInForceRedirectUrl={claimUrl}>
        <button
          type="button"
          className="text-ink-3 hover:text-ink px-2.5 text-left text-[12.5px] transition-colors"
        >
          Keep your tasks — create an account
        </button>
      </SignUpButton>
    </div>
  );
}
