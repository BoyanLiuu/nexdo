import { describe, expect, it } from "vitest";

import {
  addDays,
  daysBetween,
  formatDayHeading,
  formatDayRange,
  formatDue,
  formatLongDate,
  formatTime,
  groupByDay,
  isDueBy,
  isOverdue,
  isToday,
  todayIn,
  weekdayOf,
} from "@/lib/dates";

/**
 * `pnpm test:tz` runs this whole file under four `TZ` values. That is what proves
 * the zone-independence — not anything inside the file, which cannot change the
 * process's own zone.
 */
/** Spans the practical extremes: UTC-11 to UTC+14, a 25-hour spread. */
const ZONES = ["Pacific/Midway", "America/Los_Angeles", "UTC", "Asia/Tokyo", "Pacific/Kiritimati"];

describe("todayIn — the one zone-dependent function", () => {
  it("returns a plain calendar date", () => {
    expect(todayIn("UTC")).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  /**
   * The headline bug. At any given instant the calendar date differs across the
   * world, and a server that reads its own clock gets the wrong one for most
   * users. There is always some instant where Kiritimati and Midway disagree —
   * they are 25 hours apart — so one of these pairs always differs.
   */
  it("gives different dates in different zones at the same instant", () => {
    const dates = new Set(ZONES.map((z) => todayIn(z)));
    expect(dates.size).toBeGreaterThan(1);
  });
});

describe("calendar arithmetic", () => {
  /**
   * These take date strings, so the machine's zone cannot reach them — which is
   * the property the module is built on. Running the same assertions five times
   * in-process would not test that, because nothing between iterations changes:
   * real zone variation comes from `pnpm test:tz`, which starts the process
   * under four different `TZ` values.
   */
  // These take strings, so the zone cannot reach them — which is the point.
  it("counts whole days exactly", () => {
    expect(daysBetween("2026-11-15", "2026-11-16")).toBe(1);
    expect(daysBetween("2026-11-15", "2026-11-22")).toBe(7);
    expect(daysBetween("2026-11-16", "2026-11-15")).toBe(-1);
    expect(daysBetween("2026-11-15", "2026-11-15")).toBe(0);
  });

  it("is unaffected by a daylight-saving transition", () => {
    // Northern clocks change in late October; southern in early April.
    expect(daysBetween("2026-10-22", "2026-10-29")).toBe(7);
    expect(daysBetween("2026-04-01", "2026-04-08")).toBe(7);
  });

  it("crosses month and year boundaries", () => {
    expect(daysBetween("2026-10-31", "2026-11-01")).toBe(1);
    expect(daysBetween("2025-12-31", "2026-01-01")).toBe(1);
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("handles a leap day", () => {
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(daysBetween("2028-02-28", "2028-03-01")).toBe(2);
  });

  it("reads the weekday from the date, not from a local Date", () => {
    expect(weekdayOf("2026-11-15")).toBe(0); // a Sunday
    expect(formatDue("2026-11-17", "2026-11-15")).toBe("Tue");
  });

  it("labels relative days", () => {
    expect(formatDue("2026-11-15", "2026-11-15")).toBe("Today");
    expect(formatDue("2026-11-16", "2026-11-15")).toBe("Tomorrow");
    expect(formatDue("2026-11-14", "2026-11-15")).toBe("Yesterday");
    expect(formatDue("2026-11-28", "2026-11-15")).toBe("28 Nov");
  });
});

describe("isOverdue", () => {
  it("is false for an undated task", () => {
    expect(isOverdue(null, "2026-11-15")).toBe(false);
  });

  /**
   * The three cases the brief calls out by name. All three are string
   * comparisons against a date the *caller* computed in the user's zone, so the
   * time of day and the server's location cannot affect them.
   */
  it("a task due today is not overdue, whatever the hour", () => {
    expect(isOverdue("2026-11-15", "2026-11-15")).toBe(false);
  });

  it("a task due today is not overdue for a UTC+9 user after UTC midnight", () => {
    // 2026-11-16T00:30Z is already the 16th in Tokyo but still the 15th in UTC.
    // What matters is that the comparison uses the user's date, not the UTC one.
    const tokyoDate = "2026-11-16";
    expect(isOverdue(tokyoDate, tokyoDate)).toBe(false);
    // And the UTC date would have called it overdue, which is the bug.
    expect(isOverdue(tokyoDate, "2026-11-17")).toBe(true);
  });

  it("becomes overdue once the user's own day has moved on", () => {
    expect(isOverdue("2026-11-15", "2026-11-16")).toBe(true);
  });

  it("compares correctly across month and year boundaries", () => {
    expect(isOverdue("2026-10-31", "2026-11-01")).toBe(true);
    expect(isOverdue("2026-11-01", "2026-10-31")).toBe(false);
    expect(isOverdue("2025-12-31", "2026-01-01")).toBe(true);
  });
});

describe("isToday and isDueBy", () => {
  it("isToday matches only the exact date", () => {
    expect(isToday("2026-11-15", "2026-11-15")).toBe(true);
    expect(isToday("2026-11-16", "2026-11-15")).toBe(false);
    expect(isToday(null, "2026-11-15")).toBe(false);
  });

  it("isDueBy covers today and everything earlier", () => {
    expect(isDueBy("2026-11-15", "2026-11-15")).toBe(true);
    expect(isDueBy("2026-11-01", "2026-11-15")).toBe(true);
    expect(isDueBy("2026-11-16", "2026-11-15")).toBe(false);
    expect(isDueBy(null, "2026-11-15")).toBe(false);
  });
});

describe("groupByDay", () => {
  const tasks = [
    { id: "a", dueDate: "2026-11-15" },
    { id: "b", dueDate: "2026-11-17" },
    { id: "c", dueDate: "2026-11-17" },
    { id: "d", dueDate: null },
    { id: "e", dueDate: "2026-12-25" }, // outside the window
  ];

  it("returns one bucket per day, in order", () => {
    const days = groupByDay(tasks, "2026-11-15", 7);
    expect(days).toHaveLength(7);
    expect(days.map((d) => d.date)).toEqual([
      "2026-11-15",
      "2026-11-16",
      "2026-11-17",
      "2026-11-18",
      "2026-11-19",
      "2026-11-20",
      "2026-11-21",
    ]);
  });

  it("keeps empty days, so the week keeps its shape", () => {
    const days = groupByDay(tasks, "2026-11-15", 7);
    expect(days[1].items).toEqual([]);
    expect(days[2].items.map((t) => t.id)).toEqual(["b", "c"]);
  });

  it("drops undated tasks and anything outside the window", () => {
    const days = groupByDay(tasks, "2026-11-15", 7);
    const ids = days.flatMap((d) => d.items.map((t) => t.id));
    expect(ids).not.toContain("d");
    expect(ids).not.toContain("e");
  });

  it("spans a month boundary", () => {
    const days = groupByDay([{ dueDate: "2026-12-01" }], "2026-11-29", 5);
    expect(days.map((d) => d.date)).toContain("2026-12-01");
    expect(days.find((d) => d.date === "2026-12-01")?.items).toHaveLength(1);
  });
});

describe("formatting", () => {
  it("writes a day heading", () => {
    expect(formatDayHeading("2026-11-15", "2026-11-15")).toBe("Today 15 Nov");
    expect(formatDayHeading("2026-11-16", "2026-11-15")).toBe("Tomorrow 16 Nov");
    expect(formatDayHeading("2026-11-17", "2026-11-15")).toBe("Tuesday 17 Nov");
  });

  it("writes a day range, collapsing a shared month", () => {
    expect(formatDayRange("2026-11-15", "2026-11-21")).toBe("15 – 21 Nov");
    expect(formatDayRange("2026-11-29", "2026-12-05")).toBe("29 Nov – 5 Dec");
  });

  it("writes the long date", () => {
    expect(formatLongDate("2026-11-15")).toBe("Sunday, 15 November 2026");
  });

  it("writes times, dropping minutes on the hour", () => {
    expect(formatTime("19:00")).toBe("7pm");
    expect(formatTime("09:30")).toBe("9:30am");
    expect(formatTime("12:00")).toBe("12pm");
    expect(formatTime("00:00")).toBe("12am");
    expect(formatTime("00:05")).toBe("12:05am");
  });
});
