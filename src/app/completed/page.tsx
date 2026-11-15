import { Suspense } from "react";
import { SquareCheck } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { RailData } from "@/components/view-data";
import { RailFallback } from "@/components/rail";
import { ViewBody } from "@/components/view-body";
import { RowsFallback, ViewShell } from "@/components/view-shell";

export const metadata = { title: "Completed" };

/** A record, newest first. Unticking a row here returns it to its view. */
export default function CompletedPage() {
  return (
    <ViewShell
      title="Completed"
      rail={
        <Suspense fallback={<RailFallback current="completed" />}>
          <RailData current="completed" />
        </Suspense>
      }
    >
      <Suspense fallback={<RowsFallback />}>
        <ViewBody
          view="completed"
          empty={
            <EmptyState
              icon={<SquareCheck className="size-6" strokeWidth={1.9} />}
              title="Nothing finished yet"
            >
              Tick something off and it will be recorded here.
            </EmptyState>
          }
        />
      </Suspense>
    </ViewShell>
  );
}
