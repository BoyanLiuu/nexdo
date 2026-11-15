/**
 * Calendar dates, not instants.
 *
 * The whole module rests on one split:
 *
 *   `todayIn(zone)` is the ONLY function that looks at the current instant, and
 *   it demands a zone. Everything else takes calendar dates as `YYYY-MM-DD`
 *   strings and is zone-independent by construction — there is no clock to read
 *   and no local/UTC mismatch to get wrong.
 *
 * That split is deliberate. The server renders every view, so anything that
 * quietly read the machine's clock would produce the deploy region's date, which
 * is wrong for most users. None of these functions can do that by accident.
 *
 * The arithmetic deliberately goes through `Date.UTC`. A calendar date has no
 * zone, so pinning it to UTC midnight makes day differences exact integers and
 * immune to DST — a local-midnight `Date` would be an hour short twice a year,
 * and comparing one against `new Date("YYYY-MM-DD")` (which JS reads as UTC) is
 * off by a whole day east of UTC+12.
 */

/** Today's calendar date in a given IANA zone. The one clock-reading function. */
export function todayIn(timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)!.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function parts(isoDate: string) {
  const [y, m, d] = isoDate.split("-").map(Number);
  return { y, m, d, utc: Date.UTC(y, m - 1, d) };
}

const DAY = 86_400_000;

/** Exact whole days from one calendar date to another. Negative looks backwards. */
export function daysBetween(from: string, to: string): number {
  return (parts(to).utc - parts(from).utc) / DAY;
}

export function addDays(isoDate: string, days: number): string {
  const d = new Date(parts(isoDate).utc + days * DAY);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/** 0 = Sunday. Read in UTC, matching how the date was built. */
export function weekdayOf(isoDate: string): number {
  return new Date(parts(isoDate).utc).getUTCDay();
}

/**
 * ISO date strings compare correctly as strings, which is the reason they are
 * stored as text rather than as a DATE column.
 *
 * `from` is required on purpose: a default would let a caller silently fall back
 * to the machine's zone, which is the bug this module exists to prevent.
 */
export function isOverdue(dueDate: string | null, from: string): boolean {
  return dueDate !== null && dueDate < from;
}

export function isToday(dueDate: string | null, from: string): boolean {
  return dueDate === from;
}

/** Due today or earlier — what the Today view shows. */
export function isDueBy(dueDate: string | null, from: string): boolean {
  return dueDate !== null && dueDate <= from;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

const WEEKDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const WEEKDAY_LONG = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTH = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
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

/** "Today", "Tomorrow", "Fri", or "12 Dec" once outside the coming week. */
export function formatDue(isoDate: string, from: string): string {
  const delta = daysBetween(from, isoDate);
  if (delta === 0) return "Today";
  if (delta === 1) return "Tomorrow";
  if (delta === -1) return "Yesterday";
  if (delta > 1 && delta < 7) return WEEKDAY[weekdayOf(isoDate)];
  const { d, m } = parts(isoDate);
  return `${d} ${MONTH[m - 1]}`;
}

/** "Monday 16 November" — an Upcoming day heading. */
export function formatDayHeading(isoDate: string, from: string): string {
  const delta = daysBetween(from, isoDate);
  const { d, m } = parts(isoDate);
  const named = delta === 0 ? "Today" : delta === 1 ? "Tomorrow" : WEEKDAY_LONG[weekdayOf(isoDate)];
  return `${named} ${d} ${MONTH[m - 1]}`;
}

/** "Friday, 14 November 2026" — the design's Today subtitle. */
export function formatLongDate(isoDate: string): string {
  const { y, m, d } = parts(isoDate);
  return `${WEEKDAY_LONG[weekdayOf(isoDate)]}, ${d} ${MONTH_LONG[m - 1]} ${y}`;
}

/** "15 – 21 Nov" — the Upcoming subtitle. */
export function formatDayRange(from: string, to: string): string {
  const a = parts(from);
  const b = parts(to);
  const left = a.m === b.m ? `${a.d}` : `${a.d} ${MONTH[a.m - 1]}`;
  return `${left} – ${b.d} ${MONTH[b.m - 1]}`;
}

export function formatTime(time: string): string {
  const [h, m] = time.split(":").map(Number);
  const suffix = h < 12 ? "am" : "pm";
  const hour = h % 12 === 0 ? 12 : h % 12;
  return m === 0 ? `${hour}${suffix}` : `${hour}:${pad(m)}${suffix}`;
}

/**
 * The next `count` calendar days starting at `from`, each with the tasks due
 * that day. Days with nothing on them are kept, so Upcoming shows the shape of
 * the week rather than only its busy parts.
 */
export function groupByDay<T extends { dueDate: string | null }>(
  items: readonly T[],
  from: string,
  count: number,
): { date: string; items: T[] }[] {
  const days = Array.from({ length: count }, (_, i) => addDays(from, i));
  const byDate = new Map(days.map((date) => [date, [] as T[]]));
  for (const item of items) {
    const bucket = item.dueDate === null ? undefined : byDate.get(item.dueDate);
    bucket?.push(item);
  }
  return days.map((date) => ({ date, items: byDate.get(date)! }));
}
