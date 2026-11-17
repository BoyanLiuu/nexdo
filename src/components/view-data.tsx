import { connection } from "next/server";

import { AppShortcuts } from "@/components/app-shortcuts";
import { Rail } from "@/components/rail";
import { SearchDialog } from "@/components/search-dialog";
import { getPrincipal } from "@/lib/server/principal";
import { todayIn } from "@/lib/dates";
import { viewChrome } from "@/lib/server/task-service";

/**
 * The dynamic halves of the shell, each fetched inside its own Suspense
 * boundary so `ViewShell` can render before any query resolves.
 *
 * `getPrincipal()` is memoised per request, so these components resolving
 * independently still costs one owner lookup.
 */

/** A visitor who has never written anything has no owner row, so nothing to query. */
const EMPTY: Awaited<ReturnType<typeof viewChrome>> = {
  lists: [],
  labels: [],
  counts: { due: 0, inbox: 0, upcoming: 0, completed: 0 },
};

export async function RailData() {
  const principal = await getPrincipal();
  const today = await userToday();
  const chrome = principal.kind === "none" ? EMPTY : await viewChrome(principal, today);

  return (
    <>
      <Rail
        lists={chrome.lists}
        labels={chrome.labels}
        counts={chrome.counts}
        search={<SearchDialog now={today} />}
      />
      {/* Rendered beside the rail because it needs the same lists and labels,
          which are already fetched here — the palette costs no extra query. */}
      <AppShortcuts lists={chrome.lists} labels={chrome.labels} />
    </>
  );
}

/**
 * The user's own calendar date. The zone comes from their owner row, never from
 * the server's clock — a Vercel region's date is wrong for most of the world.
 */
export async function userToday(): Promise<string> {
  // Next flags `new Date()` as an unstable value during the prerender pass, and
  // being inside a Suspense boundary does not exempt it — only an explicit
  // dynamic access does. Declaring it here means the one function that reads a
  // clock is also the one that opts its route out of prerendering, rather than
  // every caller having to remember.
  await connection();

  const principal = await getPrincipal();
  // A first-time visitor has no stored zone yet. UTC is the honest default: it
  // is wrong for almost everyone, but there is nothing to be right about until
  // they write something, and the first mutation records their real zone.
  return todayIn(principal.kind === "none" ? "UTC" : principal.timeZone);
}
