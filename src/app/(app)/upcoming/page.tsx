import { Suspense } from "react";
import { CalendarDays } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { ViewBody } from "@/components/view-body";
import { RowsFallback, ViewShell } from "@/components/view-shell";

export const metadata = { title: "Upcoming" };

/** The next week, a day at a time. Empty days are kept so the week has shape. */
export default function UpcomingPage({
  searchParams,
}: {
  searchParams: Promise<{ sort?: string }>;
}) {
  return (
    <ViewShell title="Upcoming">
      <Suspense fallback={<RowsFallback />}>
        <ViewBody
          view="upcoming"
          searchParams={searchParams}
          empty={
            <EmptyState
              icon={<CalendarDays className="size-6" strokeWidth={1.9} />}
              title="Nothing scheduled this week"
            >
              A task added here is dated tomorrow. Say “friday” or “in 3 days” to put it elsewhere.
            </EmptyState>
          }
        />
      </Suspense>
    </ViewShell>
  );
}
