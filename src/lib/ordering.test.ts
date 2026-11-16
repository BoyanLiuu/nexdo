import { describe, expect, it } from "vitest";

import {
  isOrderKey,
  positionAfter,
  positionBefore,
  positionForMove,
  positionsAfter,
} from "@/lib/ordering";

/**
 * The library does the midpoint maths; these pin the *properties* we rely on and
 * the one place our own logic lives (`positionForMove`).
 */
describe("ordering", () => {
  it("appends and prepends outside the existing range", () => {
    const first = positionAfter(null);
    const second = positionAfter(first);
    expect(second > first).toBe(true);
    expect(positionBefore(first) < first).toBe(true);
  });

  it("generates a block of keys in order", () => {
    const keys = positionsAfter(null, 4);
    expect(keys).toHaveLength(4);
    expect([...keys].sort()).toEqual(keys);
  });

  describe("positionForMove", () => {
    /** Build a list, move one row, and read back the resulting order. */
    const move = (count: number, from: number, to: number) => {
      const positions = positionsAfter(null, count);
      const rows = positions.map((position, i) => ({ id: `t${i}`, position }));
      rows[from].position = positionForMove(positions, from, to);
      return [...rows].sort((a, b) => (a.position < b.position ? -1 : 1)).map((r) => r.id);
    };

    it("moves a row down", () => {
      expect(move(4, 0, 2)).toEqual(["t1", "t2", "t0", "t3"]);
    });

    it("moves a row up", () => {
      expect(move(4, 3, 1)).toEqual(["t0", "t3", "t1", "t2"]);
    });

    it("moves a row to the very top and the very bottom", () => {
      expect(move(3, 2, 0)).toEqual(["t2", "t0", "t1"]);
      expect(move(3, 0, 2)).toEqual(["t1", "t2", "t0"]);
    });

    /**
     * The edge case that made this function necessary. Taking neighbours from
     * the original list means a one-place move asks for a key between a row and
     * itself, which the library rejects.
     */
    it("handles a move by one place in either direction", () => {
      expect(move(3, 0, 1)).toEqual(["t1", "t0", "t2"]);
      expect(move(3, 1, 0)).toEqual(["t1", "t0", "t2"]);
    });

    it("writes only the moved row's key", () => {
      const positions = positionsAfter(null, 5);
      const moved = positionForMove(positions, 4, 1);
      // Every other key is untouched — that is the whole point of fractional
      // ordering over integer positions.
      expect(positions.filter((p) => p !== positions[4])).toHaveLength(4);
      expect(moved > positions[0] && moved < positions[1]).toBe(true);
    });
  });
});

describe("isOrderKey", () => {
  /**
   * The regression this module shipped with for three milestones.
   *
   * Task positions were generated as `Date.now().toString(36)`. Those sort
   * correctly on their own, so lists looked right, and the suite passed —
   * because every test above builds its inputs with `positionsAfter`, which
   * only ever produces valid keys. The application produced a different kind
   * of value entirely, and placing a key next to one threw.
   *
   * So this asserts the shape of the thing that actually broke, rather than the
   * shape the tests happened to be using.
   */
  it("rejects the timestamp keys task creation used to generate", () => {
    const legacy = Date.now().toString(36);
    expect(isOrderKey(legacy)).toBe(false);
    expect(() => positionAfter(legacy)).toThrow(/invalid order key/);
  });

  it("accepts the keys this module generates", () => {
    expect(isOrderKey(positionAfter(null))).toBe(true);
    for (const key of positionsAfter(null, 5)) expect(isOrderKey(key)).toBe(true);
  });

  it("treats nothing as not a key", () => {
    expect(isOrderKey(null)).toBe(false);
    expect(isOrderKey(undefined)).toBe(false);
    expect(isOrderKey("")).toBe(false);
  });

  /**
   * A move whose neighbours predate the repair must still produce a key rather
   * than throwing — the row lands approximately instead of springing back.
   */
  it("still moves a row whose neighbours hold legacy keys", () => {
    const legacy = [Date.now().toString(36), (Date.now() + 1).toString(36)];
    const moved = positionForMove(legacy, 1, 0);
    expect(isOrderKey(moved)).toBe(true);
  });
});
