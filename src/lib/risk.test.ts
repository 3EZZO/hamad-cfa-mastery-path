import { describe, expect, it } from "vitest";
import { getPlanTasks, PLAN } from "../data/plan";
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
    expect(indicators.some((item) => item.id === "overdue-work" && item.tone === "red")).toBe(true);
    expect(indicators.some((item) => item.id === "practice-gap")).toBe(true);
    expect(indicators.some((item) => item.id === "diagnostic-missing")).toBe(true);
  });

  it("treats a student session request as incomplete until the tutor approves it", () => {
    const state = createDefaultState();
    const tasks = getPlanTasks(PLAN[0]);
    for (const task of tasks) {
      if (task.kind === "session") {
        state.sessionCompletionRequests[task.id] = {
          taskId: task.id,
          requestedAt: "2026-08-29T12:00:00.000Z",
        };
      } else {
        state.taskCompletions[task.id] = true;
      }
    }

    let indicator = buildRiskIndicators(state, "2026-08-30")
      .find((item) => item.id === "overdue-work");
    expect(indicator?.title).toContain("2 overdue required items");

    for (const task of tasks.filter((candidate) => candidate.kind === "session")) {
      state.sessionCompletionReviews[task.id] = {
        taskId: task.id,
        requestedAt: "2026-08-29T12:00:00.000Z",
        reviewedAt: "2026-08-29T14:00:00.000Z",
        status: "approved",
        note: "Evidence reviewed.",
      };
    }
    indicator = buildRiskIndicators(state, "2026-08-30")
      .find((item) => item.id === "overdue-work");
    expect(indicator).toBeUndefined();
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
      confidence: 3,
    });
    const indicators = buildRiskIndicators(state, "2026-08-26");
    expect(indicators.find((item) => item.id === "practice-accuracy")?.tone).toBe("red");
  });

  it("detects a meaningful decline against the preceding 14-day window", () => {
    const state = createDefaultState();
    state.practiceLogs.push(
      {
        id: "prior", date: "2026-08-27", topic: "Quantitative Methods",
        attempted: 50, correct: 45, source: "LES", note: "Prior window", confidence: 4,
      },
      {
        id: "recent", date: "2026-09-12", topic: "Quantitative Methods",
        attempted: 50, correct: 35, source: "LES", note: "Recent window", confidence: 3,
      },
    );
    const decline = buildRiskIndicators(state, "2026-09-20")
      .find((item) => item.id === "practice-decline");
    expect(decline?.tone).toBe("red");
    expect(decline?.detail).toContain("20 percentage points");
  });

  it("recognizes due unresolved mistake retests", () => {
    const state = createDefaultState();
    state.errorEntries.push({
      id: "e1",
      date: "2026-08-27",
      topic: "Quantitative Methods",
      category: "Concept gap",
      summary: "Return convention",
      correction: "Name the period first.",
      revisitDate: "2026-08-31",
      resolved: false,
    });
    expect(buildRiskIndicators(state, "2026-08-31").some((item) => item.id === "due-retests")).toBe(true);
  });

  it("keeps unresolved mistakes visible before their retest becomes due", () => {
    const state = createDefaultState();
    state.errorEntries.push({
      id: "e1",
      date: "2026-08-27",
      topic: "Quantitative Methods",
      category: "Concept gap",
      summary: "Return convention",
      correction: "Name the period first.",
      revisitDate: "2026-09-03",
      resolved: false,
    });
    expect(buildRiskIndicators(state, "2026-08-31").some((item) => item.id === "open-mistakes")).toBe(true);
  });

  it("uses the mock's selected milestone instead of array position", () => {
    const state = createDefaultState();
    state.mockScores.push({
      id: "m7",
      date: "2027-02-20",
      label: "Final rehearsal",
      score: 70,
      note: "",
      milestoneWeek: 26,
    });
    const gap = buildRiskIndicators(state, "2027-02-20")
      .find((item) => item.id === "mock-gap");
    expect(gap?.detail).toContain("72% coaching target");
  });
});
