import { describe, expect, it } from "vitest";

import {
  daysBetween,
  formatDue,
  formatLongDate,
  formatTime,
  isOverdue,
  isToday,
} from "@/lib/dates";

/**
 * M0 covers only what these helpers claim today. The zone-correctness suite —
 * the same task evaluated under Asia/Tokyo, America/Los_Angeles and UTC — is M3,
 * when the owner's zone replaces the machine's local one.
 */
describe("isOverdue", () => {
  it("is false for an undated task", () => {
    expect(isOverdue(null, "2026-11-14")).toBe(false);
  });

  it("is false on the due day itself", () => {
    expect(isOverdue("2026-11-14", "2026-11-14")).toBe(false);
  });

  it("is true the day after", () => {
    expect(isOverdue("2026-11-13", "2026-11-14")).toBe(true);
  });

  it("compares ISO dates as strings across a month boundary", () => {
    expect(isOverdue("2026-10-31", "2026-11-01")).toBe(true);
    expect(isOverdue("2026-11-01", "2026-10-31")).toBe(false);
  });

  it("compares correctly across a year boundary", () => {
    expect(isOverdue("2025-12-31", "2026-01-01")).toBe(true);
  });
});

describe("isToday", () => {
  it("matches only the exact date", () => {
    expect(isToday("2026-11-14", "2026-11-14")).toBe(true);
    expect(isToday("2026-11-15", "2026-11-14")).toBe(false);
    expect(isToday(null, "2026-11-14")).toBe(false);
  });
});

describe("daysBetween", () => {
  it("counts forward and backward", () => {
    expect(daysBetween("2026-11-14", "2026-11-17")).toBe(3);
    expect(daysBetween("2026-11-14", "2026-11-11")).toBe(-3);
    expect(daysBetween("2026-11-14", "2026-11-14")).toBe(0);
  });

  it("is unaffected by a daylight-saving transition", () => {
    // Northern-hemisphere clocks change in late October; the gap is still 7 days.
    expect(daysBetween("2026-10-22", "2026-10-29")).toBe(7);
  });
});

describe("formatDue", () => {
  const now = "2026-11-14"; // a Saturday

  it("names the adjacent days", () => {
    expect(formatDue("2026-11-14", now)).toBe("Today");
    expect(formatDue("2026-11-15", now)).toBe("Tomorrow");
    expect(formatDue("2026-11-13", now)).toBe("Yesterday");
  });

  it("uses the weekday inside the coming week", () => {
    expect(formatDue("2026-11-17", now)).toBe("Tue");
  });

  it("falls back to a date once past the week", () => {
    expect(formatDue("2026-11-28", now)).toBe("28 Nov");
    expect(formatDue("2026-11-11", now)).toBe("11 Nov");
  });
});

describe("formatTime", () => {
  it("drops the minutes on the hour", () => {
    expect(formatTime("19:00")).toBe("7pm");
    expect(formatTime("09:30")).toBe("9:30am");
  });

  it("handles both noon and midnight", () => {
    expect(formatTime("12:00")).toBe("12pm");
    expect(formatTime("00:00")).toBe("12am");
  });
});

describe("formatLongDate", () => {
  it("reads as the design's Today subtitle", () => {
    expect(formatLongDate("2026-11-14")).toBe("Saturday, 14 November 2026");
  });
});
