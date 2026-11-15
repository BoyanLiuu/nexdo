"use client";

import { Menu, Search } from "lucide-react";

import { openMobileNav, openSearch } from "@/lib/chrome-events";

/**
 * The two buttons in the mobile topbar.
 *
 * They existed as markup from the first milestone and did nothing, which went
 * unnoticed because every milestone was verified on a desktop viewport. A
 * button that looks like a button and does nothing is worse than no button.
 *
 * Tap targets are 44px, the smallest a finger reliably hits; the icons stay
 * visually smaller inside that box.
 */
export function MobileTopbarActions({ side }: { side: "nav" | "search" }) {
  if (side === "nav") {
    return (
      <button
        type="button"
        onClick={openMobileNav}
        aria-label="Open views and lists"
        className="rounded-cell text-ink-2 hover:bg-hover active:bg-hover -ml-2 grid size-11 place-items-center"
      >
        <Menu className="size-5" strokeWidth={1.9} />
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={openSearch}
      aria-label="Search"
      className="rounded-cell text-ink-2 hover:bg-hover active:bg-hover -mr-2 grid size-11 place-items-center"
    >
      <Search className="size-5" strokeWidth={1.9} />
    </button>
  );
}
