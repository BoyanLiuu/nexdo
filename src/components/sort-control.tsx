"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { ArrowUpDown } from "lucide-react";

import type { SortKey } from "@/lib/server/task-service";

/**
 * Sort lives in the URL rather than in component state.
 *
 * The ordering is applied by the database query, so the server has to know it —
 * and putting it in a search param means the choice survives a reload, can be
 * linked, and needs no client store to coordinate with the RSC payload.
 */
const OPTIONS: { value: SortKey; label: string }[] = [
  { value: "manual", label: "Manual order" },
  { value: "due", label: "Due date" },
  { value: "priority", label: "Priority" },
];

export function SortControl({ value }: { value: SortKey }) {
  const router = useRouter();
  const params = useSearchParams();

  return (
    <label className="text-ink-2 ml-auto inline-flex items-center gap-1.5 text-[13px]">
      <ArrowUpDown className="text-ink-3 size-3.5" strokeWidth={2} aria-hidden />
      <span className="sr-only">Sort by</span>
      <select
        value={value}
        onChange={(e) => {
          const next = new URLSearchParams(params);
          // "manual" is the default, so keep it out of the URL.
          if (e.target.value === "manual") next.delete("sort");
          else next.set("sort", e.target.value);
          const query = next.toString();
          router.replace(query ? `?${query}` : "?", { scroll: false });
        }}
        className="text-ink-2 hover:text-ink cursor-pointer appearance-none bg-transparent font-[550] outline-none"
      >
        {OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
