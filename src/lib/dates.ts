/**
 * Provisional date helpers for M0 presentation only.
 *
 * These read the machine's local zone. M3 replaces them with zone-aware versions
 * that take the user's IANA zone as an argument, because the server renders
 * these views and must not use its own clock — otherwise the date boundary moves
 * with the deploy region. Until then, do not rely on these being correct for
 * anyone but you.
 */

/**
 * Today's calendar date in a given IANA zone, as `YYYY-MM-DD`.
 *
 * The zone is an argument because the *server* renders these views: calling
 * `new Date()` and reading its local parts would yield the deploy region's date,
 * which is wrong for most users. The owner row carries the zone for exactly
 * this call.
 *
 * Omitting the zone uses the machine's own, which is only ever right in dev.
 */
export function todayIn(timeZone?: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)!.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** The machine's local calendar date. Prefer `todayIn(owner.timeZone)`. */
export function today(): string {
  return todayIn();
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
