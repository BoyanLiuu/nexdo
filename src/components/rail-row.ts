/**
 * The shared look of a rail row.
 *
 * Extracted because the rail is split across a server component (the fixed
 * views) and a client one (lists and labels, which need optimistic state). Both
 * need these classes, and importing them from either component would couple the
 * two in a circle.
 */
export const ROW =
  "flex h-9 items-center gap-2.5 rounded-cell px-2.5 text-[14.5px] font-[550] transition-colors";
export const ROW_IDLE = "text-ink-2 hover:bg-rail-hover hover:text-ink";
export const ROW_CURRENT = "bg-card-paper text-ink shadow-item";
