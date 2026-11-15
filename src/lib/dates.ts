/**
 * Provisional date helpers for M0 presentation only.
 *
 * These read the machine's local zone. M3 replaces them with zone-aware
 * versions that take the owner's IANA zone as an argument, because the server
 * renders these views and must not use its own clock — see ARCHITECTURE.md §7.
 * Until then, do not rely on these being correct for anyone but you.
 */

/** Local calendar date as `YYYY-MM-DD`. */
export function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** ISO date strings compare correctly as strings, which is why they are stored as text. */
export function isOverdue(dueDate: string | null, from: string = today()): boolean {
  return dueDate !== null && dueDate < from;
}

export function isToday(dueDate: string | null, from: string = today()): boolean {
  return dueDate === from;
}

const WEEKDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function parts(isoDate: string) {
  const [y, m, d] = isoDate.split("-").map(Number);
  return { y, m, d, date: new Date(y, m - 1, d) };
}

export function daysBetween(from: string, to: string): number {
  const a = parts(from).date;
  const b = parts(to).date;
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

/** "Today", "Tomorrow", "Fri", or "12 Dec" once outside the coming week. */
export function formatDue(isoDate: string, from: string = today()): string {
  const delta = daysBetween(from, isoDate);
  if (delta === 0) return "Today";
  if (delta === 1) return "Tomorrow";
  if (delta === -1) return "Yesterday";
  const { d, m, date } = parts(isoDate);
  if (delta > 1 && delta < 7) return WEEKDAY[date.getDay()];
  return `${d} ${MONTH[m - 1]}`;
}

const WEEKDAY_LONG = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTH_LONG = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/** "Friday, 14 November 2026" — the design's Today subtitle. */
export function formatLongDate(isoDate: string): string {
  const { y, m, d, date } = parts(isoDate);
  return `${WEEKDAY_LONG[date.getDay()]}, ${d} ${MONTH_LONG[m - 1]} ${y}`;
}

export function formatTime(time: string): string {
  const [h, m] = time.split(":").map(Number);
  const suffix = h < 12 ? "am" : "pm";
  const hour = h % 12 === 0 ? 12 : h % 12;
  return m === 0 ? `${hour}${suffix}` : `${hour}:${String(m).padStart(2, "0")}${suffix}`;
}
