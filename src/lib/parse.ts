import type { ParsedResult } from "chrono-node";

import { formatDue, formatTime } from "@/lib/dates";
import type { Priority } from "@/lib/types";

/**
 * Turns one line of typed text into task fields, and reports what it consumed
 * so the UI can show removable chips and strip the title cleanly.
 *
 * Structured so M4 can add `#list` and `@label` by writing another scanner and
 * pushing onto `matches` — tokenisation does not need reworking.
 */

export type ChipKind = "date" | "time" | "priority" | "list" | "label";

export type Chip = {
  /**
   * Stable while the matched text is unchanged, so dismissing a chip survives
   * further typing elsewhere in the line. Deliberately not span-based: spans
   * shift when you edit earlier in the string.
   */
  id: string;
  kind: ChipKind;
  /** What to show on the chip. */
  label: string;
};

type Match = {
  chip: Chip;
  /** Character range in the original text, used to strip the title. */
  from: number;
  to: number;
  apply: (fields: Fields) => void;
};

type Fields = {
  dueDate: string | null;
  dueTime: string | null;
  priority: Priority;
  listId: string | null;
  labelIds: string[];
};

export type ParsedCapture = Fields & {
  /** The text with every accepted match removed. */
  title: string;
  chips: Chip[];
};

const PRIORITY = /\bp([1-3])\b/gi;
/** `#home`, `#deep-work`. Unquoted and single-word, so a name with a space is
 *  matched on its first word and the rest stays in the title. */
const LIST_TOKEN = /#([\w-]+)/g;
const LABEL_TOKEN = /@([\w-]+)/g;

/** Names are matched case- and separator-insensitively, so `#deepwork`
 *  finds "Deep work". */
function slug(value: string): string {
  return value.toLowerCase().replace(/[\s_-]+/g, "");
}

/** Writing any one of these means the date was intended, not inferred. */
const CERTAIN_DATE_PARTS = ["weekday", "day", "month", "year"] as const;

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/**
 * Read the calendar date from chrono's *components*, never from `.date()`.
 *
 * `.date()` returns a JS Date, and reading it back through `toISOString()`
 * shifts it into UTC — "tomorrow 5pm" becomes the following day for anyone west
 * of Greenwich. The components are already in the parser's local zone, which
 * client-side is the user's own.
 */
function calendarDate(result: ParsedResult): string | null {
  const year = result.start.get("year");
  const month = result.start.get("month");
  const day = result.start.get("day");
  if (year === null || month === null || day === null) return null;
  return `${year}-${pad(month)}-${pad(day)}`;
}

/**
 * Only treat a match as carrying a time when the user wrote something
 * unambiguously time-like.
 *
 * chrono reports `meridiem` as known for "5pm", "9:30am" and "17:00", but not
 * for a bare "at 5" — which is what stops "meet at 5 guys" becoming a 5pm task.
 * Without this gate the chip would still make the mistake visible, but the
 * default would be wrong far too often to trust.
 */
function certainTime(result: ParsedResult): string | null {
  if (!result.start.isCertain("meridiem")) return null;
  const hour = result.start.get("hour");
  const minute = result.start.get("minute");
  if (hour === null) return null;
  return `${pad(hour)}:${pad(minute ?? 0)}`;
}

/**
 * `chrono` is passed in rather than imported so the caller controls when the
 * module loads — it is the heaviest dependency here and most page views never
 * type anything. Until it arrives, priority parsing still works.
 */
export type Chrono = {
  parse: (text: string, ref?: Date, options?: { forwardDate?: boolean }) => ParsedResult[];
};

export function parseCapture(
  text: string,
  options: {
    /** Today in the owner's zone, for rendering "Today"/"Tomorrow" chips. */
    today: string;
    chrono?: Chrono;
    /** Known lists and labels, so `#home` can resolve to an id. */
    lists?: readonly { id: string; name: string }[];
    labels?: readonly { id: string; name: string }[];
    /** Chip ids the user has dismissed. Their matches stay in the title. */
    dismissed?: ReadonlySet<string>;
    /** Reference instant for relative dates. The browser's clock, client-side. */
    now?: Date;
  },
): ParsedCapture {
  const { today, chrono, dismissed, now, lists, labels } = options;
  const matches: Match[] = [];

  for (const m of text.matchAll(PRIORITY)) {
    const value = Number(m[1]) as 1 | 2 | 3;
    matches.push({
      chip: { id: `priority:${m[0].toLowerCase()}`, kind: "priority", label: `P${value}` },
      from: m.index,
      to: m.index + m[0].length,
      apply: (f) => {
        f.priority = value;
      },
    });
  }

  // `#list` and `@label` only consume text when they match something real. An
  // unresolved token stays in the title rather than silently disappearing — the
  // user may simply have typed a "#" in a sentence.
  for (const [pattern, kind, source] of [
    [LIST_TOKEN, "list" as const, lists],
    [LABEL_TOKEN, "label" as const, labels],
  ] as const) {
    if (!source?.length) continue;
    pattern.lastIndex = 0;
    for (const m of text.matchAll(pattern)) {
      const found = source.find((entry) => slug(entry.name) === slug(m[1]));
      if (!found) continue;
      matches.push({
        chip: {
          id: `${kind}:${found.id}`,
          kind,
          label: kind === "list" ? found.name : `@${found.name}`,
        },
        from: m.index,
        to: m.index + m[0].length,
        apply: (f) => {
          if (kind === "list") f.listId = found.id;
          else if (!f.labelIds.includes(found.id)) f.labelIds.push(found.id);
        },
      });
    }
  }

  if (chrono) {
    for (const result of chrono.parse(text, now ?? new Date(), { forwardDate: true })) {
      // A date is only intended if the user wrote something date-ish. For "at 5"
      // chrono reports only hour and minute as certain and fills the day in from
      // the reference — offering a "Today" chip for text that never mentions
      // today claims an intent that was not there.
      const date = CERTAIN_DATE_PARTS.some((part) => result.start.isCertain(part))
        ? calendarDate(result)
        : null;
      const time = certainTime(result);

      // Neither certain: "meet at 5 guys" consumes nothing at all.
      if (!date && !time) continue;

      const label = [date && formatDue(date, today), time && formatTime(time)]
        .filter(Boolean)
        .join(" ");

      matches.push({
        chip: { id: `when:${result.text.toLowerCase()}`, kind: time ? "time" : "date", label },
        from: result.index,
        to: result.index + result.text.length,
        apply: (f) => {
          // A time with no date means today, which the caller supplies — so
          // "call mum 7pm" still works without inventing a date here.
          if (date) f.dueDate = date;
          f.dueTime = time;
        },
      });
    }
  }

  // Chips read left to right in the order the tokens appear, not in the order
  // the scanners happened to run.
  const accepted = matches
    .filter((m) => !dismissed?.has(m.chip.id))
    .sort((a, b) => a.from - b.from);

  const fields: Fields = { dueDate: null, dueTime: null, priority: 4, listId: null, labelIds: [] };
  for (const match of accepted) match.apply(fields);

  // Cut the accepted spans out of the original text rather than string-replacing
  // the matched words: a task genuinely called "P1 rollout" must keep its name
  // when the token is dismissed.
  let title = text;
  for (const match of [...accepted].sort((a, b) => b.from - a.from)) {
    title = title.slice(0, match.from) + title.slice(match.to);
  }

  return {
    ...fields,
    title: title.replace(/\s+/g, " ").trim(),
    // De-duplicated: "p1 ... p1" should offer one chip, not two.
    chips: [...new Map(accepted.map((m) => [m.chip.id, m.chip])).values()],
  };
}
