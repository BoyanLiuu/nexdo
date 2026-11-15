import type { ListColour } from "@/lib/types";

/**
 * Tailwind classes per list accent. Shared because the rail swatch and the task
 * row's meta dot must never drift apart.
 */
export const LIST_DOT: Record<ListColour, string> = {
  grass: "bg-grass",
  sky: "bg-sky",
  violet: "bg-violet",
  orange: "bg-orange",
  rose: "bg-rose",
  teal: "bg-teal",
  olive: "bg-olive",
  brown: "bg-brown",
  slate: "bg-slate",
};
