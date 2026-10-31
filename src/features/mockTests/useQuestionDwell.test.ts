import { describe, expect, it } from "vitest";
import { addDwell } from "./useQuestionDwell";

describe("per-question time", () => {
  it("adds time to one question without touching the others", () => {
    expect(addDwell([0, 1000, 0], 1, 1500.4)).toEqual([0, 2500, 0]);
  });

  it("ignores empty time and out-of-range questions", () => {
    const base = [5, 5];
    expect(addDwell(base, 0, 0)).toEqual([5, 5]);
    expect(addDwell(base, 2, 1000)).toEqual([5, 5]);
    expect(addDwell(base, -1, 1000)).toEqual([5, 5]);
    expect(base).toEqual([5, 5]);
  });
});
