import { describe, expect, it } from "vitest";

import { describeRepeat, nextDue, schedulesFromCompletion } from "@/lib/repeat";
import type { Repeat } from "@/lib/schemas";

/**
 * These run under four `TZ` values via `pnpm test:tz`. `nextDue` takes and
 * returns calendar-date strings and reads no clock, so the zone must not change
 * a single answer — if any of these ever differ by zone, the module has grown a
 * `new Date()` somewhere it should not have.
 */

describe("weekdays", () => {
  it("skips the weekend, so Friday's next occurrence is Monday", () => {
    // 2026-11-20 is a Friday.
    expect(nextDue({ kind: "weekdays" }, "2026-11-20")).toBe("2026-11-23");
  });

  it("lands on Monday from a Saturday, not on the Sunday", () => {
    expect(nextDue({ kind: "weekdays" }, "2026-11-21")).toBe("2026-11-23");
  });

  it("is the next day inside the working week", () => {
    expect(nextDue({ kind: "weekdays" }, "2026-11-17")).toBe("2026-11-18");
  });
});

describe("monthly", () => {
  const monthly31: Repeat = { kind: "monthly", interval: 1, day: 31 };

  it("clamps to the end of a short month", () => {
    expect(nextDue(monthly31, "2026-01-31")).toBe("2026-02-28");
  });

  it("returns to the 31st after being clamped", () => {
    // The rule remembers the day the user asked for. Reading the day off the
    // previous result would stick at the 28th for ever.
    expect(nextDue(monthly31, "2026-02-28")).toBe("2026-03-31");
  });

  it("clamps to 29 February in a leap year", () => {
    expect(nextDue(monthly31, "2028-01-31")).toBe("2028-02-29");
  });

  it("rolls the year over in December", () => {
    expect(nextDue(monthly31, "2026-12-31")).toBe("2027-01-31");
  });

  it("advances by the interval, not by one month", () => {
    expect(nextDue({ kind: "monthly", interval: 3, day: 15 }, "2026-11-15")).toBe("2027-02-15");
  });
});

describe("weekly", () => {
  it("moves to the next wanted day in the same week", () => {
    // Mondays and Wednesdays, from a Monday.
    expect(nextDue({ kind: "weekly", interval: 1, weekdays: [1, 3] }, "2026-11-16")).toBe(
      "2026-11-18",
    );
  });

  it("wraps to the first wanted day of the following week", () => {
    // From Wednesday there is no later wanted day, so it wraps to Monday.
    expect(nextDue({ kind: "weekly", interval: 1, weekdays: [1, 3] }, "2026-11-18")).toBe(
      "2026-11-23",
    );
  });

  it("skips a whole week when the interval is 2", () => {
    // Not the Monday 7 days out — the one after it.
    expect(nextDue({ kind: "weekly", interval: 2, weekdays: [1] }, "2026-11-16")).toBe(
      "2026-11-30",
    );
  });

  it("treats Sunday as the start of the week", () => {
    // Sunday is day 0, so a Sunday rule from Sunday is 7 days on, not 0.
    expect(nextDue({ kind: "weekly", interval: 1, weekdays: [0] }, "2026-11-15")).toBe(
      "2026-11-22",
    );
  });
});

describe("daily", () => {
  it("advances by the interval across a month boundary", () => {
    expect(nextDue({ kind: "daily", interval: 5 }, "2026-11-28")).toBe("2026-12-03");
  });
});

describe("afterCompletion", () => {
  it("counts from the base it is given", () => {
    expect(nextDue({ kind: "afterCompletion", days: 3 }, "2026-11-20")).toBe("2026-11-23");
  });

  /**
   * The base for this kind is the completion date, not the due date — and the
   * service picks the base by asking this function, so a wrong answer here
   * schedules every "after completion" task off the wrong day.
   */
  it("is the only kind that schedules from completion", () => {
    expect(schedulesFromCompletion({ kind: "afterCompletion", days: 3 })).toBe(true);
    expect(schedulesFromCompletion({ kind: "daily", interval: 1 })).toBe(false);
    expect(schedulesFromCompletion({ kind: "weekdays" })).toBe(false);
    expect(schedulesFromCompletion({ kind: "weekly", interval: 1, weekdays: [1] })).toBe(false);
    expect(schedulesFromCompletion({ kind: "monthly", interval: 1, day: 1 })).toBe(false);
  });
});

describe("describeRepeat", () => {
  it("picks the right ordinal, including the teens", () => {
    const on = (day: number) => describeRepeat({ kind: "monthly", interval: 1, day });
    expect(on(1)).toBe("Monthly on the 1st");
    expect(on(2)).toBe("Monthly on the 2nd");
    expect(on(3)).toBe("Monthly on the 3rd");
    expect(on(4)).toBe("Monthly on the 4th");
    // The teens are the case a naive `day % 10` gets wrong.
    expect(on(11)).toBe("Monthly on the 11th");
    expect(on(12)).toBe("Monthly on the 12th");
    expect(on(13)).toBe("Monthly on the 13th");
    expect(on(21)).toBe("Monthly on the 21st");
    expect(on(31)).toBe("Monthly on the 31st");
  });

  it("names the days of a weekly rule in week order, not click order", () => {
    expect(describeRepeat({ kind: "weekly", interval: 1, weekdays: [5, 1] })).toBe(
      "Every Mon, Fri",
    );
  });
});
