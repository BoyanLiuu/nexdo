import { Suspense } from "react";
import { ListTodo } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { RailFallback } from "@/components/rail";
import { ViewBody } from "@/components/view-body";
import { RailData } from "@/components/view-data";
import { RowsFallback, ViewShell } from "@/components/view-shell";
import { ListTitle, TitleFallback } from "@/components/view-title";

/** One list's open tasks. */
/**
 * Request-time, unlike the four fixed views.
 *
 * There is nothing to prerender: ids are per-owner, so no `generateStaticParams`
 * can enumerate them, and `await params` is itself dynamic data. `instant` is
 * the escape hatch that works under `cacheComponents` — `export const dynamic`
 * is rejected outright with it enabled.
 */
export const instant = false;

export default async function ListPage({
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
          <ListTitle id={id} />
        </Suspense>
      }
      rail={
        <Suspense fallback={<RailFallback current="list" />}>
          <RailData current="list" currentId={id} />
        </Suspense>
      }
    >
      <Suspense fallback={<RowsFallback />}>
        <ViewBody
          view="list"
          targetId={id}
          title="Open tasks in this list."
          searchParams={searchParams}
          empty={
            <EmptyState
              icon={<ListTodo className="size-6" strokeWidth={1.9} />}
              title="Nothing in this list"
            >
              Add a task above and it lands here.
            </EmptyState>
          }
        />
      </Suspense>
    </ViewShell>
  );
}
