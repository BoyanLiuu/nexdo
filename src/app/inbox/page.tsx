import { Suspense } from "react";
import { Inbox } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { RailData } from "@/components/view-data";
import { RailFallback } from "@/components/rail";
import { ViewBody } from "@/components/view-body";
import { RowsFallback, ViewShell } from "@/components/view-shell";

export const metadata = { title: "Inbox" };

/** Tasks with no list. Capture here is deliberately undated. */
export default function InboxPage({ searchParams }: { searchParams: Promise<{ sort?: string }> }) {
  return (
    <ViewShell
      title="Inbox"
      rail={
        <Suspense fallback={<RailFallback current="inbox" />}>
          <RailData current="inbox" />
        </Suspense>
      }
    >
      <Suspense fallback={<RowsFallback />}>
        <ViewBody
          view="inbox"
          searchParams={searchParams}
          empty={
            <EmptyState
              icon={<Inbox className="size-6" strokeWidth={1.9} />}
              title="Inbox is clear"
            >
              Anything you capture without a date or a list waits here.
            </EmptyState>
          }
        />
      </Suspense>
    </ViewShell>
  );
}
