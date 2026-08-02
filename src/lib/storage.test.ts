import { describe, expect, it } from "vitest";
import { TOPICS } from "../data/plan";
import { createDefaultState, normalizeState } from "./storage";

describe("tracker backup invariants", () => {
  it("creates a mastery field for every curriculum topic", () => {
    const state = createDefaultState();
    expect(Object.keys(state.topicMastery)).toEqual([...TOPICS]);
  });

  it("rejects unknown backup versions", () => {
    expect(() => normalizeState({ version: 2 })).toThrow(/version 1/i);
  });

  it("clamps imported mastery values", () => {
    const state = normalizeState({
      ...createDefaultState(),
      topicMastery: {
        [TOPICS[0]]: 140,
        [TOPICS[1]]: -20,
      },
    });
    expect(state.topicMastery[TOPICS[0]]).toBe(100);
    expect(state.topicMastery[TOPICS[1]]).toBe(0);
  });
});
