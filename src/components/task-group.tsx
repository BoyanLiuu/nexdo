import type { ReactNode } from "react";

/**
 * A titled band of rows: "Overdue 3", "Today 5".
 * Mirrors `.group` / `.group-h` in the prototype. `tone="late"` is the
 * vermilion Overdue heading — an explicit variant rather than an `isLate` flag.
 */
export function TaskGroup({
  title,
  count,
  tone = "default",
  children,
}: {
  title: string;
  count: number;
  tone?: "default" | "late";
  children: ReactNode;
}) {
  return (
    <section className="mt-[26px] first:mt-[18px]">
      <div className="border-hair flex items-baseline gap-2.5 border-b px-1.5 pb-2">
        <h2
          className={`text-[14.5px] font-bold tracking-[-0.005em] ${
            tone === "late" ? "text-verm" : "text-ink"
          }`}
        >
          {title}
        </h2>
        <span className="text-ink-3 text-[13.5px] font-medium">{count}</span>
      </div>
      <ul className="list-none">{children}</ul>
    </section>
  );
}
