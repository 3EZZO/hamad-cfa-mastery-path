import { describe, expect, it } from "vitest";
import { formatMockSection, summarizeMockSections, weakMockSections } from "./mockSections";
import { buildRiskIndicators } from "./risk";
import { createDefaultState, normalizeState } from "./storage";

const sections = [
  { topic: "Quantitative Methods", attempted: 18, correct: 15 },
  { topic: "Economics", attempted: 12, correct: 5 },
  { topic: "Fixed Income", attempted: 20, correct: 12 },
];

describe("mock section helpers", () => {
  it("summarises accuracy weakest first and formats a chip", () => {
    const summary = summarizeMockSections({ sections });
    expect(summary.map((section) => [section.topic, section.accuracy])).toEqual([
      ["Economics", 42], ["Fixed Income", 60], ["Quantitative Methods", 83],
    ]);
    expect(formatMockSection(summary[0]!, (topic) => topic.slice(0, 4))).toBe("Econ 5/12 · 42%");
    expect(summarizeMockSections({})).toEqual([]);
  });

  it("flags sections ten points under the target or below half marks", () => {
    expect(weakMockSections({ sections }, 72).map((section) => section.topic)).toEqual(["Economics", "Fixed Income"]);
    expect(weakMockSections({ sections }, 55).map((section) => section.topic)).toEqual(["Economics"]);
    expect(weakMockSections({ sections: [{ topic: "Economics", attempted: 10, correct: 9 }] }, 72)).toEqual([]);
  });
});

describe("mock sections in the tracker state", () => {
  it("keeps a valid breakdown and drops unknown topics, duplicates and impossible counts", () => {
    const normalized = normalizeState({
      ...createDefaultState(),
      mockScores: [{
        id: "mock-1", date: "2027-01-16", label: "Mock 1", score: 64, note: "", milestoneWeek: 19,
        sections: [
          { topic: "Quantitative Methods", attempted: "18", correct: 15.4 },
          { topic: "Quantitative Methods", attempted: 5, correct: 5 },
          { topic: "Made-up topic", attempted: 10, correct: 5 },
          { topic: "Economics", attempted: 10, correct: 11 },
          { topic: "Fixed Income", attempted: 0, correct: 0 },
          "junk",
        ],
      }, {
        id: "mock-2", date: "2027-01-23", label: "Mock 2", score: 66, note: "",
      }],
    });
    expect(normalized.mockScores[0]?.sections).toEqual([{ topic: "Quantitative Methods", attempted: 18, correct: 15 }]);
    expect(normalized.mockScores[1]).not.toHaveProperty("sections");
  });

  it("raises a weak-section indicator for the latest mock without touching readiness weights", () => {
    const state = createDefaultState();
    state.mockScores.push({
      id: "m7", date: "2027-02-20", label: "Mock 7", score: 70, note: "", milestoneWeek: 24, sections,
    });
    // Mock 7 targets 72%: Economics (42%) and Fixed Income (60%) fall under the band.
    const indicators = buildRiskIndicators(state, "2027-02-21");
    const weak = indicators.find((item) => item.id === "mock-weak-sections");
    expect(weak).toBeDefined();
    expect(weak!.tone).toBe("red");
    expect(weak!.title).toContain("2 sections of Mock 7");
    expect(weak!.detail).toContain("Economics 5/12 (42%)");
    expect(weak!.action).toContain("Repair Economics first");

    // Mock 1 targets 60%: only Economics is weak, and a headline-only mock raises nothing.
    const mockOne = createDefaultState();
    mockOne.mockScores.push({ id: "m1", date: "2027-01-16", label: "Mock 1", score: 70, note: "", milestoneWeek: 19, sections });
    expect(buildRiskIndicators(mockOne, "2027-01-17").find((item) => item.id === "mock-weak-sections")?.title).toContain("1 section of Mock 1");
    const headlineOnly = createDefaultState();
    headlineOnly.mockScores.push({ id: "m1", date: "2027-01-16", label: "Mock 1", score: 70, note: "", milestoneWeek: 19 });
    expect(buildRiskIndicators(headlineOnly, "2027-01-17").some((item) => item.id === "mock-weak-sections")).toBe(false);
  });
});
