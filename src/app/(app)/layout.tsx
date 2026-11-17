import { Suspense } from "react";

import { RailFallback } from "@/components/rail";
import { RailShell } from "@/components/rail-shell";
import { RailData } from "@/components/view-data";

/**
 * The app frame: the rail, and the column the views render into.
 *
 * The rail lives here rather than in each page. Next preserves a layout across
 * navigation between its children, so this renders once per full load and
 * survives every click between views. It used to sit inside each page, which
 * meant leaving a page unmounted the rail with it: the next route's fallback
 * drew a rail with no lists, no labels and no counts while six queries re-ran,
 * so the whole sidebar visibly blinked on every navigation.
 *
 * A route group rather than the root layout, because `/sign-in` and `/sign-up`
 * are under the root too and have no business showing navigation into an app
 * you are not in yet. The group costs nothing — `(app)` is not a URL segment —
 * and all six views still share this one layout, which is what fixes the blink.
 *
 * The rail stays inside Suspense: the boundary is what keeps each route's shell
 * prerenderable, and it is the boundary that matters, not where the component is
 * declared.
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-ground flex h-dvh overflow-hidden">
      <RailShell>
        <Suspense fallback={<RailFallback />}>
          <RailData />
        </Suspense>
      </RailShell>
      {children}
    </div>
  );
}
