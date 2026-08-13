import { describe, expect, it } from "vitest";
import { createDefaultState } from "./storage";
import { buildRiskIndicators } from "./risk";

describe("automatic coaching risks", () => {
  it("does not raise performance alarms before launch", () => {
    const indicators = buildRiskIndicators(createDefaultState(), "2026-08-13");
    expect(indicators).toHaveLength(1);
    expect(indicators[0].tone).toBe("green");
    expect(indicators[0].id).toBe("prelaunch");
  });

  it("detects overdue work, missing practice, and a missing baseline", () => {
    const indicators = buildRiskIndicators(createDefaultState(), "2026-09-10");
    expect(indicators.some((item) => item.id === "overdue-sessions" && item.tone === "red")).toBe(true);
    expect(indicators.some((item) => item.id === "practice-gap")).toBe(true);
    expect(indicators.some((item) => item.id === "diagnostic-missing")).toBe(true);
  });

  it("uses a meaningful recent sample before flagging accuracy", () => {
    const state = createDefaultState();
    state.practiceLogs.push({
      id: "p1",
      date: "2026-08-25",
      topic: "Quantitative Methods",
      attempted: 40,
      correct: 22,
      source: "LES",
      note: "Baseline",
    });
    const indicators = buildRiskIndicators(state, "2026-08-26");
    expect(indicators.find((item) => item.id === "practice-accuracy")?.tone).toBe("red");
  });

  it("recognizes due unresolved mistake retests", () => {
    const state = createDefaultState();
    state.errorEntries.push({
      id: "e1",
      date: "2026-08-20",
      topic: "Quantitative Methods",
      category: "Concept gap",
      summary: "Return convention",
      correction: "Name the period first.",
      revisitDate: "2026-08-24",
      resolved: false,
    });
    expect(buildRiskIndicators(state, "2026-08-24").some((item) => item.id === "due-retests")).toBe(true);
  });
});
