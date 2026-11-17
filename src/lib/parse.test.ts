import * as chrono from "chrono-node";
import { describe, expect, it } from "vitest";

import { parseCapture } from "@/lib/parse";

/**
 * A fixed Sunday, so "friday", "next monday" and "tomorrow" have stable answers.
 * Noon local, to keep the reference away from a midnight boundary.
 */
const NOW = new Date(2026, 10, 15, 12, 0, 0); // 2026-11-15, a Sunday
const TODAY = "2026-11-15";

const parse = (text: string, dismissed?: Set<string>) =>
  parseCapture(text, { today: TODAY, chrono, now: NOW, dismissed });

describe("priority tokens", () => {
  it("reads p1 and strips it from the title", () => {
    const r = parse("pay rent p1");
    expect(r.title).toBe("pay rent");
    expect(r.priority).toBe(1);
  });

  it("accepts p2 and p3, and is case-insensitive", () => {
    expect(parse("thing P2").priority).toBe(2);
    expect(parse("thing p3").priority).toBe(3);
  });

  it("defaults to 4 — no priority — when none is written", () => {
    expect(parse("plain task").priority).toBe(4);
  });

  it("ignores p-numbers that are part of a word", () => {
    // "p4" is out of range, and "sp1" is not a priority token.
    expect(parse("deploy sp1nner p4").priority).toBe(4);
    expect(parse("deploy sp1nner p4").title).toBe("deploy sp1nner p4");
  });
});

describe("dates", () => {
  it("reads a weekday as the coming one", () => {
    const r = parse("pay rent friday");
    expect(r.title).toBe("pay rent");
    expect(r.dueDate).toBe("2026-11-20");
  });

  it("reads tomorrow", () => {
    expect(parse("bins tomorrow").dueDate).toBe("2026-11-16");
  });

  it("reads a relative offset", () => {
    expect(parse("follow up in 3 days").dueDate).toBe("2026-11-18");
    expect(parse("follow up in 3 days").title).toBe("follow up");
  });

  it("reads next monday", () => {
    expect(parse("retro next monday").dueDate).toBe("2026-11-16");
  });

  /**
   * The regression that matters most. chrono reads dates in the local zone, and
   * taking the answer back out through toISOString() would shift it a day for
   * anyone west of Greenwich — the exact bug the whole project is built around.
   */
  it("keeps the calendar date the user meant, not a UTC-shifted one", () => {
    expect(parse("ship it tomorrow 5pm").dueDate).toBe("2026-11-16");
    expect(parse("ship it tomorrow 5pm").dueTime).toBe("17:00");
  });
});

describe("times", () => {
  it("accepts an explicit pm time", () => {
    const r = parse("call mum at 7pm");
    expect(r.dueTime).toBe("19:00");
    expect(r.title).toBe("call mum");
  });

  it("accepts a 24-hour time", () => {
    expect(parse("deploy 17:00").dueTime).toBe("17:00");
  });

  it("accepts minutes", () => {
    expect(parse("standup 9:30am").dueTime).toBe("09:30");
  });

  /**
   * The non-parse case. chrono does find "at 5" here and would happily call it
   * 5pm, but it reports no `meridiem`, so the gate refuses to set a time. A
   * sentence that merely contains a number must not silently acquire one.
   */
  it("does not invent a time from a bare number", () => {
    const r = parse("meet at 5 guys");
    expect(r.dueTime).toBeNull();
    // And consumes nothing: no date either, and the title is left whole. chrono
    // does match "at 5" here, but neither the time nor the date was intended,
    // so offering a "Today" chip would claim an intent the user never had.
    expect(r.dueDate).toBeNull();
    expect(r.title).toBe("meet at 5 guys");
    expect(r.chips).toHaveLength(0);
  });

  it("accepts a bare time as today, with no date chip of its own", () => {
    const r = parse("call mum 7pm");
    expect(r.dueTime).toBe("19:00");
    // The date is left for the caller to default to the current view's day.
    expect(r.dueDate).toBeNull();
    expect(r.chips[0].label).toBe("7pm");
  });

  it("leaves ordinary counting alone entirely", () => {
    expect(parse("buy 5 apples")).toMatchObject({
      title: "buy 5 apples",
      dueDate: null,
      dueTime: null,
      priority: 4,
    });
    expect(parse("review 3 PRs").title).toBe("review 3 PRs");
  });
});

describe("recurrence phrases, which this parser does not implement", () => {
  it("does not turn 'every 3 days' into a task due in 3 days", () => {
    // Found on the deployed app: this filed a one-off task due 3 days out and
    // left the lead-in word behind, titled "water the plants every".
    expect(parse("water the plants every 3 days")).toMatchObject({
      title: "water the plants every 3 days",
      dueDate: null,
      dueTime: null,
    });
    expect(parse("water the plants every 3 days").chips).toEqual([]);
  });

  it("does not turn 'every monday' into a task due this monday", () => {
    // Worse than the above, because the coming Monday can be today: typed on a
    // Monday this produced a task due immediately.
    const monday = new Date(2026, 10, 16, 12, 0, 0); // 2026-11-16, a Monday
    const r = parseCapture("standup every monday", {
      today: "2026-11-16",
      chrono,
      now: monday,
    });
    expect(r.title).toBe("standup every monday");
    expect(r.dueDate).toBeNull();
  });

  it("still reads a date when 'every' does not introduce it", () => {
    // The guard is anchored to the end of the preceding text, so a stray
    // "every" earlier in the line must not suppress a real date.
    expect(parse("every so often call mum friday")).toMatchObject({
      title: "every so often call mum",
      dueDate: "2026-11-20",
    });
  });
});

describe("chips", () => {
  it("offers one chip per consumed token", () => {
    const r = parse("pay rent friday p1");
    expect(r.chips.map((c) => c.kind).sort()).toEqual(["date", "priority"]);
    expect(r.chips.find((c) => c.kind === "priority")?.label).toBe("P1");
  });

  it("labels today and tomorrow in words", () => {
    expect(parse("thing today").chips[0].label).toBe("Today");
    expect(parse("thing tomorrow").chips[0].label).toBe("Tomorrow");
  });

  it("shows the time on the chip when there is one", () => {
    expect(parse("call at 7pm").chips[0].label).toBe("7pm");
    expect(parse("call tomorrow at 7pm").chips[0].label).toBe("Tomorrow 7pm");
  });

  it("de-duplicates a token written twice", () => {
    expect(parse("p1 thing p1").chips.filter((c) => c.kind === "priority")).toHaveLength(1);
  });
});

describe("dismissing a chip", () => {
  it("returns the token to the title and drops the field", () => {
    const first = parse("pay rent friday p1");
    const priorityChip = first.chips.find((c) => c.kind === "priority")!;

    const after = parse("pay rent friday p1", new Set([priorityChip.id]));
    expect(after.priority).toBe(4);
    expect(after.title).toBe("pay rent p1");
    // The date is untouched by dismissing the priority.
    expect(after.dueDate).toBe("2026-11-20");
  });

  it("can dismiss the date and keep the priority", () => {
    const first = parse("pay rent friday p1");
    const dateChip = first.chips.find((c) => c.kind === "date")!;

    const after = parse("pay rent friday p1", new Set([dateChip.id]));
    expect(after.dueDate).toBeNull();
    expect(after.title).toBe("pay rent friday");
    expect(after.priority).toBe(1);
  });
});

describe("chip order", () => {
  it("reads left to right, matching the typed text", () => {
    // "friday" comes before "p1" in the text, so its chip comes first — even
    // though the priority scanner runs first.
    expect(parse("pay rent friday p1").chips.map((c) => c.kind)).toEqual(["date", "priority"]);
    expect(parse("p1 pay rent friday").chips.map((c) => c.kind)).toEqual(["priority", "date"]);
  });
});

/**
 * Not tested here: chip labels under a different time zone. Setting
 * `process.env.TZ` mid-process also moves chrono's reference date, so such a
 * test asserts two things at once and passes for the wrong reason.
 *
 * The bug that prompted the thought is gone structurally rather than by test:
 * parse.ts had its own date formatter that compared a locally-constructed Date
 * against `new Date("YYYY-MM-DD")` — UTC midnight — so at UTC+13/+14 tomorrow's
 * chip read "16 Nov" instead of "Tomorrow". That copy is deleted; there is now
 * one formatter, in dates.ts, which builds both sides the same way. M3's
 * TZ-parameterised suite is where this gets covered systematically.
 */

describe("before chrono has loaded", () => {
  /**
   * The capture box imports chrono on the first keystroke, so a fast typist can
   * press Enter before it resolves. Submitting in that window used to drop the
   * date silently and file the task under today; submit now waits for the
   * parser, with a deadline. This pins the degraded behaviour it waits past:
   * priority still works, and an unparsed date stays in the title rather than
   * being guessed at.
   */
  it("parses priority but leaves date text alone", () => {
    const r = parseCapture("pay rent friday p1", { today: TODAY, now: NOW });
    expect(r.priority).toBe(1);
    expect(r.dueDate).toBeNull();
    expect(r.title).toBe("pay rent friday");
  });
});

describe("list and label tokens", () => {
  const lists = [
    { id: "l-home", name: "Home" },
    { id: "l-deep", name: "Deep work" },
  ];
  const labels = [{ id: "b-quick", name: "quick" }];
  const parseWith = (text: string) =>
    parseCapture(text, { today: TODAY, chrono, now: NOW, lists, labels });

  it("resolves a list token to its id and strips it", () => {
    const r = parseWith("pay rent #home");
    expect(r.listId).toBe("l-home");
    expect(r.title).toBe("pay rent");
  });

  it("matches names case- and separator-insensitively", () => {
    // "Deep work" has a space; "#deepwork" should still find it.
    expect(parseWith("ship it #deepwork").listId).toBe("l-deep");
    expect(parseWith("ship it #DEEPWORK").listId).toBe("l-deep");
  });

  it("collects labels and strips them", () => {
    const r = parseWith("tidy up @quick");
    expect(r.labelIds).toEqual(["b-quick"]);
    expect(r.title).toBe("tidy up");
  });

  /**
   * The important one. An unresolved token must stay in the title: a "#" in a
   * sentence is far more common than a typo'd list name, and silently deleting
   * the word would be worse than ignoring the token.
   */
  it("leaves an unknown token in the title", () => {
    const r = parseWith("read #42 of the spec");
    expect(r.listId).toBeNull();
    expect(r.title).toBe("read #42 of the spec");
    expect(r.chips).toHaveLength(0);
  });

  it("ignores tokens entirely when no lists or labels exist yet", () => {
    const r = parseCapture("pay rent #home", { today: TODAY, chrono, now: NOW });
    expect(r.listId).toBeNull();
    expect(r.title).toBe("pay rent #home");
  });

  it("combines with a date and a priority", () => {
    const r = parseWith("pay rent friday p1 #home");
    expect(r).toMatchObject({ title: "pay rent", listId: "l-home", priority: 1 });
    expect(r.dueDate).toBe("2026-11-20");
    expect(r.chips.map((c) => c.kind)).toEqual(["date", "priority", "list"]);
  });
});
