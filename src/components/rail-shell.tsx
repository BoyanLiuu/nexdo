"use client";

import { useEffect, useState } from "react";

import { CHROME_EVENTS } from "@/lib/chrome-events";

/**
 * Where the rail sits.
 *
 * One rail element, positioned differently by breakpoint rather than rendered
 * twice. From `md` up it is the static sidebar it has always been. Below that it
 * is off-canvas and slides in — which is the whole reason this exists: the rail
 * was simply `hidden` on mobile, so a phone could reach Today and nothing else.
 * No Upcoming, no Inbox, no lists, no labels. The two buttons in the mobile
 * topbar had been placeholders since the first milestone.
 *
 * Rendering the rail twice and letting CSS hide one copy would be simpler, and
 * wrong: two copies means two "New list" buttons with the same accessible name,
 * and a screen reader reading the whole navigation twice.
 */
export function RailShell({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    function onOpen() {
      setOpen(true);
    }
    window.addEventListener(CHROME_EVENTS.openNav, onOpen);
    return () => window.removeEventListener(CHROME_EVENTS.openNav, onOpen);
  }, []);

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      {/* Backdrop, mobile only. Below the rail, above everything else. */}
      {open && (
        <button
          type="button"
          aria-label="Close views and lists"
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-30 bg-[rgb(27_31_51/0.28)] md:hidden"
        />
      )}

      <div
        /**
         * Navigating is the whole point of the drawer, so following a link has
         * to close it — and a `<Link>` inside the rail does not notify this
         * component. One delegated handler here catches every link in the rail,
         * including Enter on a focused one, which also fires a click.
         *
         * This used to derive `open` from a path comparison instead. That read
         * the URL, and a client component reading the URL outside a Suspense
         * boundary makes every route under this layout unprerenderable — which
         * is exactly what it did once the rail moved into the layout. A click is
         * the more direct signal anyway: it is the interaction, not a trace of
         * it, and it closes the drawer even when the link is the current page.
         */
        onClick={(event) => {
          if ((event.target as HTMLElement).closest("a")) setOpen(false);
        }}
        // `md:translate-x-0` wins back the desktop layout unconditionally, so
        // the drawer state cannot leak into it. No width of its own: the rail
        // sets that, and a second guess at it left a transparent strip between
        // the drawer's edge and its own shadow.
        className={`z-40 max-md:fixed max-md:inset-y-0 max-md:left-0 max-md:shadow-[18px_0_40px_-20px_rgb(27_31_51/0.35)] max-md:transition-[transform,visibility] md:visible md:z-auto md:translate-x-0 ${
          open
            ? "max-md:visible max-md:translate-x-0"
            : // `invisible`, not just translated: an off-canvas rail is still in
              // the tab order and still read by a screen reader, which would
              // mean navigating a drawer nobody can see. `visibility` is the one
              // property that fixes both and can be scoped to a breakpoint,
              // where `aria-hidden` and `inert` would need a JS media query and
              // the hydration mismatch that comes with one.
              "max-md:invisible max-md:-translate-x-full"
        }`}
      >
        {children}
      </div>
    </>
  );
}
