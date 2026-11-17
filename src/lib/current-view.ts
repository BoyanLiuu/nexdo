import type { ViewKey } from "@/components/rail";

/**
 * Which rail row to highlight, derived from the URL.
 *
 * The rail used to be told this: every page passed `current` and `currentId`
 * down. That is why it lived inside each page, and why it vanished and came
 * back on every navigation — a page is unmounted when you leave it, so its rail
 * went with it and the next route's Suspense fallback rendered a rail with no
 * lists, no labels and no counts while six queries re-ran.
 *
 * Moving it to the layout fixes that, because Next preserves layouts across
 * navigation. But a layout does not know which of its children is active, so
 * the highlight has to come from somewhere else — and the URL already says it.
 *
 * Pure and exhaustive so it can be tested without a router.
 */
export function currentViewFromPath(pathname: string): {
  current: ViewKey;
  currentId?: string;
} {
  if (pathname === "/") return { current: "today" };
  if (pathname.startsWith("/upcoming")) return { current: "upcoming" };
  if (pathname.startsWith("/inbox")) return { current: "inbox" };
  if (pathname.startsWith("/completed")) return { current: "completed" };

  const list = pathname.match(/^\/list\/([^/]+)/);
  if (list) return { current: "list", currentId: list[1] };

  const label = pathname.match(/^\/label\/([^/]+)/);
  if (label) return { current: "label", currentId: label[1] };

  // Anywhere else — the sign-in pages, a 404 — highlights nothing rather than
  // guessing at Today, which would claim the user is somewhere they are not.
  return { current: "none" };
}
