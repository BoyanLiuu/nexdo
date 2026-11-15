import { Suspense } from "react";
import { Tag } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { RailFallback } from "@/components/rail";
import { ViewBody } from "@/components/view-body";
import { RailData } from "@/components/view-data";
import { RowsFallback, ViewShell } from "@/components/view-shell";
import { LabelTitle, TitleFallback } from "@/components/view-title";

/** One label's open tasks, across every list. */
/**
 * Request-time, unlike the four fixed views.
 *
 * There is nothing to prerender: ids are per-owner, so no `generateStaticParams`
 * can enumerate them, and `await params` is itself dynamic data. `instant` is
 * the escape hatch that works under `cacheComponents` — `export const dynamic`
 * is rejected outright with it enabled.
 */
export const instant = false;

export default async function LabelPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ sort?: string }>;
}) {
  const { id } = await params;

  return (
    <ViewShell
      title={
        <Suspense fallback={<TitleFallback />}>
          <LabelTitle id={id} />
        </Suspense>
      }
      rail={
        <Suspense fallback={<RailFallback current="label" />}>
          <RailData current="label" currentId={id} />
        </Suspense>
      }
    >
      <Suspense fallback={<RowsFallback />}>
        <ViewBody
          view="label"
          targetId={id}
          title="Across every list."
          searchParams={searchParams}
          empty={
            <EmptyState
              icon={<Tag className="size-6" strokeWidth={1.9} />}
              title="Nothing labelled yet"
            >
              Open a task&apos;s details to add this label.
            </EmptyState>
          }
        />
      </Suspense>
    </ViewShell>
  );
}
