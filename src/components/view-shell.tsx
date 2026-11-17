import type { ReactNode } from "react";

import { BrandMark } from "@/components/brand";
import { MobileTopbarActions } from "@/components/mobile-topbar-actions";

/**
 * The scrolling column: mobile topbar, title, and the subtitle, capture box and
 * rows beneath it.
 *
 * The rail used to be here too, which is why it was unmounted on every
 * navigation. It now lives in `app/(app)/layout.tsx`, which Next preserves
 * across navigation — see that file and `lib/current-view.ts`.
 *
 * Deliberately static. Everything that needs the database arrives through these
 * slots wrapped in Suspense by each route, so this chrome renders before any
 * query resolves.
 */
export function ViewShell({
  title,
  children,
}: {
  /**
   * A node, not a string, so a list or label name can stream inside its own
   * Suspense boundary. Resolving it in the route body would read cookies there
   * and cost the whole route its prerender.
   */
  title: ReactNode;
  children: ReactNode;
}) {
  return (
    <main className="relative min-w-0 flex-1 scroll-pt-[200px] overflow-y-auto">
      <div className="mx-auto max-w-[780px] px-4 pb-[140px] md:px-10">
        <div className="bg-ground sticky top-0 z-10 pt-0 md:pt-[30px]">
          <div className="-mx-2 flex h-13 items-center gap-1 md:hidden">
            <MobileTopbarActions side="nav" />
            <span className="flex flex-1 items-center gap-[9px] pl-1 text-[16px] leading-none font-bold">
              <BrandMark />
              Nexdo
            </span>
            <MobileTopbarActions side="search" />
          </div>

          <header className="mb-4 flex items-start gap-4">
            <div className="min-w-0 flex-1">
              <h1 className="text-[26px] leading-[1.15] font-bold tracking-[-0.02em] text-balance md:text-[30px]">
                {title}
              </h1>
              {children}
            </div>
          </header>
        </div>
      </div>
    </main>
  );
}

/** The subtitle line under a view's title. */
export function ViewSubtitle({ children }: { children: ReactNode }) {
  return (
    <div className="text-ink-2 mt-[5px] flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[14px]">
      {children}
    </div>
  );
}

/** Stands in for a list of rows while the query is in flight. */
export function RowsFallback() {
  return (
    <div aria-hidden className="mt-6 animate-pulse">
      <div className="border-hair mb-2 flex items-baseline gap-2.5 border-b px-1.5 pb-2">
        <div className="bg-hair h-3.5 w-20 rounded" />
      </div>
      {[0, 1, 2].map((i) => (
        <div key={i} className="border-hair-soft flex items-start gap-3 border-b px-2 py-[13px]">
          <div className="bg-hair size-5 rounded-[6px]" />
          <div className="flex-1 space-y-2">
            <div className="bg-hair h-3.5 rounded" style={{ width: `${70 - i * 12}%` }} />
            <div className="bg-hair-soft h-3 w-24 rounded" />
          </div>
        </div>
      ))}
    </div>
  );
}
