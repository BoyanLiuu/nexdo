/**
 * Two named window events, used as an internal API between the static shell and
 * the streamed parts of it.
 *
 * The mobile topbar lives in `ViewShell`, which is deliberately static so the
 * frame paints before any query resolves. The navigation drawer and the search
 * dialog live inside Suspense boundaries that stream separately. A button in
 * the first has to open something in the second, and there is no shared parent
 * holding state that does not also drag the whole shell into the dynamic half.
 *
 * So: an event, dispatched by name. Not a simulated keystroke — those are
 * indistinguishable from a real user pressing a key and break the moment a
 * binding changes — and not a context provider spanning the boundary, which
 * would cost the shell its prerender. Two events, declared here so the names
 * cannot drift between the dispatcher and the listener.
 */

export const CHROME_EVENTS = {
  openNav: "nexdo:open-nav",
  openSearch: "nexdo:open-search",
} as const;

export function openMobileNav() {
  window.dispatchEvent(new Event(CHROME_EVENTS.openNav));
}

export function openSearch() {
  window.dispatchEvent(new Event(CHROME_EVENTS.openSearch));
}
