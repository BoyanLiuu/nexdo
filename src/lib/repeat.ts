import { WEEKDAY, addDays, addMonths, weekdayOf } from "@/lib/dates";
import type { Repeat } from "@/lib/schemas";

/**
 * When a repeating task comes round again.
 *
 * Pure calendar arithmetic over `YYYY-MM-DD` strings, like `dates.ts` and for
 * the same reason: no clock, no zone, nothing that can quietly produce the
 * server region's answer. The caller supplies the base date, which is the only
 * decision that needs to know what time it is anywhere.
 *
 * Not `RRULE`. The iCalendar grammar covers every fixed schedule and cannot
 * express "three days after I last did it", which is the rule people actually
 * want for watering plants and changing bedsheets. A five-member union covers
 * what this app offers, is exhaustively checkable by the compiler, and reads as
 * itself in the database.
 */

/**
 * The next occurrence strictly after `base`.
 *
 * `base` is the *scheduled* date for fixed rules and the *completion* date for
 * `afterCompletion` — the caller resolves that, because turning a completion
 * instant into a calendar date needs the owner's zone.
 */
export function nextDue(repeat: Repeat, base: string): string {
  switch (repeat.kind) {
    case "daily":
      return addDays(base, repeat.interval);

    case "weekdays":
      return nextWeekdayOnOrAfter(addDays(base, 1));

    case "weekly":
      return nextInWeekdaySet(base, repeat.weekdays, repeat.interval);

    case "monthly":
      return addMonths(base, repeat.interval, repeat.day);

    case "afterCompletion":
      return addDays(base, repeat.days);
  }
}

/**
 * Deduplicated and in week order. The arithmetic needs the order to find the
 * next day; the description needs it so days read Mon, Fri rather than in the
 * order they were clicked. Shared so the two cannot disagree.
 */
function inWeekOrder(weekdays: readonly number[]): number[] {
  return [...new Set(weekdays)].sort((a, b) => a - b);
}

/** Saturday and Sunday are skipped, so a Friday task next falls on Monday. */
function nextWeekdayOnOrAfter(isoDate: string): string {
  let date = isoDate;
  while (weekdayOf(date) === 0 || weekdayOf(date) === 6) date = addDays(date, 1);
  return date;
}

/**
 * The next day in `weekdays` after `base`. When the set is exhausted for this
 * week it wraps to the first wanted day of the week `interval` weeks on, so
 * "every other Monday" skips a Monday rather than drifting by 14 days from
 * whenever the last one happened to be completed.
 *
 * Weeks start on Sunday, matching `weekdayOf`.
 */
function nextInWeekdaySet(base: string, weekdays: readonly number[], interval: number): string {
  const wanted = inWeekOrder(weekdays);
  const current = weekdayOf(base);

  const laterThisWeek = wanted.find((day) => day > current);
  if (laterThisWeek !== undefined) return addDays(base, laterThisWeek - current);

  const daysToNextSunday = 7 - current;
  return addDays(base, daysToNextSunday + (interval - 1) * 7 + wanted[0]);
}

/**
 * Whether the rule schedules from the calendar or from the last completion.
 * The two need different base dates, and callers should not re-derive that test
 * by matching on `kind`.
 */
export function schedulesFromCompletion(repeat: Repeat): boolean {
  return repeat.kind === "afterCompletion";
}

/** The rule in words, for the row badge and the editor's summary line. */
export function describeRepeat(repeat: Repeat): string {
  switch (repeat.kind) {
    case "daily":
      return repeat.interval === 1 ? "Every day" : `Every ${repeat.interval} days`;

    case "weekdays":
      return "Every weekday";

    case "weekly": {
      const days = inWeekOrder(repeat.weekdays)
        .map((day) => WEEKDAY[day])
        .join(", ");
      return repeat.interval === 1 ? `Every ${days}` : `Every ${repeat.interval} weeks on ${days}`;
    }

    case "monthly": {
      const day = `${repeat.day}${ordinal(repeat.day)}`;
      return repeat.interval === 1
        ? `Monthly on the ${day}`
        : `Every ${repeat.interval} months on the ${day}`;
    }

    case "afterCompletion":
      return repeat.days === 1 ? "A day after completion" : `${repeat.days} days after completion`;
  }
}

function ordinal(day: number): string {
  if (day % 100 >= 11 && day % 100 <= 13) return "th";
  switch (day % 10) {
    case 1:
      return "st";
    case 2:
      return "nd";
    case 3:
      return "rd";
    default:
      return "th";
  }
}
