import type { ReactNode } from "react";

/**
 * Per the brief: an empty Today reads as success, not as an error. Each view
 * gets its own copy rather than sharing one blank panel.
 */
export function EmptyState({
  icon,
  title,
  children,
}: {
  icon: ReactNode;
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center px-6 py-16 text-center">
      <div className="rounded-panel bg-blue-tint text-blue mb-4 grid size-12 place-items-center">
        {icon}
      </div>
      <h2 className="text-ink text-[17px] font-bold">{title}</h2>
      <p className="text-ink-3 mt-1.5 max-w-[34ch] text-[14px] leading-[1.5]">{children}</p>
    </div>
  );
}
