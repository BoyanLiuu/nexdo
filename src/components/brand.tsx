/**
 * The Nexdo mark: a queue of seven, with the next one standing up.
 * Mirrors the design prototype's `.brand-mark`.
 */
export function BrandMark({ className = "" }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={`grid grid-cols-[repeat(7,4px)] items-end gap-[1.5px] ${className}`}
    >
      <i className="bg-blue h-[15px] rounded-[1.5px]" />
      <i className="bg-hair-strong h-[6px] rounded-[1.5px]" />
      <i className="bg-hair-strong h-[6px] rounded-[1.5px]" />
      <i className="bg-hair-strong h-[6px] rounded-[1.5px] opacity-[0.62]" />
      <i className="bg-hair-strong h-[6px] rounded-[1.5px] opacity-[0.62]" />
      <i className="bg-hair-strong h-[6px] rounded-[1.5px] opacity-[0.38]" />
      <i className="bg-hair-strong h-[6px] rounded-[1.5px] opacity-[0.38]" />
    </span>
  );
}

export function Brand() {
  return (
    <div className="flex items-center gap-[9px] px-2 pt-0.5 pb-4 text-[17px] font-bold tracking-[-0.01em]">
      <BrandMark />
      Nexdo
    </div>
  );
}
