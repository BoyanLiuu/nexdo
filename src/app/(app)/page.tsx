import { Suspense } from "react";
import { CalendarCheck } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { ViewBody } from "@/components/view-body";
import { RowsFallback, ViewShell } from "@/components/view-shell";

/**
 * Today: everything due now or earlier.
 *
 * The route itself is static — the shell and the title render immediately. Both
 * dynamic halves sit behind Suspense, so the database is never in the way of
 * first paint, and the `instant = false` escape hatch M1 needed is gone.
 */
export default function TodayPage({ searchParams }: { searchParams: Promise<{ sort?: string }> }) {
  return (
    <ViewShell title="Today">
      <Suspense fallback={<RowsFallback />}>
        <ViewBody
          view="today"
          searchParams={searchParams}
          empty={
            <EmptyState
              icon={<CalendarCheck className="size-6" strokeWidth={1.9} />}
              title="Nothing due today"
            >
              Everything scheduled for today is done. Add a task above and it lands here.
            </EmptyState>
          }
        />
      </Suspense>
    </ViewShell>
  );
}
