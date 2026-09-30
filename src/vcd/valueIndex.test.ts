import { describe, expect, it } from "vitest";
import { changesInRange, indexAt, valueAt } from "./valueIndex";

const changes = [
  { t: 10n, v: "0" },
  { t: 20n, v: "1" },
  { t: 30n, v: "0" },
];

describe("valueIndex", () => {
  it("valueAt returns x before the first assignment", () => {
    expect(valueAt(changes, 5n, 1)).toBe("x");
    expect(valueAt([], 0n, 4)).toBe("xxxx");
  });

  it("valueAt hits boundaries exactly", () => {
    expect(valueAt(changes, 10n, 1)).toBe("0");
    expect(valueAt(changes, 19n, 1)).toBe("0");
    expect(valueAt(changes, 20n, 1)).toBe("1");
    expect(valueAt(changes, 99999999999999999999n, 1)).toBe("0");
  });

  it("indexAt binary-searches the last change <= t", () => {
    expect(indexAt(changes, 9n)).toBe(-1);
    expect(indexAt(changes, 10n)).toBe(0);
    expect(indexAt(changes, 25n)).toBe(1);
    expect(indexAt(changes, 30n)).toBe(2);
  });

  it("changesInRange includes the left continuation and only in-range events", () => {
    const r = changesInRange(changes, 15n, 25n);
    expect(r.initialIndex).toBe(0); // value 0 carried in from the left
    expect(r.events).toEqual([{ t: 20n, v: "1" }]);
    const all = changesInRange(changes, 0n, 100n);
    expect(all.initialIndex).toBe(-1);
    expect(all.events).toHaveLength(3);
  });
});
