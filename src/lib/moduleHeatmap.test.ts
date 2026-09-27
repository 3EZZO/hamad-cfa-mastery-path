import { describe, expect, it } from "vitest";
import { EXAM_WEIGHTS, weightMidpoint } from "../data/examWeights";
import { getPlanTasks, PLAN, TOPICS } from "../data/plan";
import { READING_CATALOG } from "../data/readings";
import type { PracticeModuleInsight } from "./practiceInsights";
import { createDefaultState } from "./storage";
import { buildModuleHeatmap, catalogIdForPracticeModule, heatmapState, taughtCatalogIds } from "./moduleHeatmap";

const NOW = new Date("2026-10-20T12:00:00Z");

function insight(moduleId: string, overrides: Partial<PracticeModuleInsight> = {}): PracticeModuleInsight {
  return { moduleId, questionCount: 10, attempted: 0, correct: 0, accuracy: null, lapses: 0, due: 0, lastAttemptedAt: null, ...overrides };
}

describe("exam weights", () => {
  it("cover every curriculum topic with a sane range", () => {
    for (const topic of TOPICS) {
      expect(EXAM_WEIGHTS[topic].min).toBeGreaterThan(0);
      expect(EXAM_WEIGHTS[topic].max).toBeGreaterThanOrEqual(EXAM_WEIGHTS[topic].min);
    }
  });
});

describe("module heatmap", () => {
  it("links practice modules to catalog modules by their mNNN prefix", () => {
    expect(catalogIdForPracticeModule("m004-tvm-valuation")).toBe("cfa-2027-outline-m004");
    expect(catalogIdForPracticeModule("m012")).toBe("cfa-2027-outline-m012");
    expect(catalogIdForPracticeModule("module-01")).toBeNull();
    expect(catalogIdForPracticeModule("m01-rates-and-returns")).toBeNull();
  });

  it("classifies cells by evidence", () => {
    expect(heatmapState(0, 0, null)).toBe("none");
    expect(heatmapState(10, 0, null)).toBe("new");
    expect(heatmapState(10, 5, 50)).toBe("repair");
    expect(heatmapState(10, 5, 70)).toBe("building");
    expect(heatmapState(10, 5, 85)).toBe("ready");
  });

  it("orders topics by exam weight and lists every catalog module once", () => {
    const heatmap = buildModuleHeatmap({ modules: [], taught: new Set(), now: NOW });
    const midpoints = heatmap.rows.map((row) => weightMidpoint(row.topic));
    expect(midpoints).toEqual([...midpoints].sort((a, b) => b - a));
    expect(heatmap.rows[0].topic).toBe("Ethical and Professional Standards");
    expect(heatmap.rows.flatMap((row) => row.cells)).toHaveLength(READING_CATALOG.readings.length);
    expect(heatmap.weightedAccuracy).toBeNull();
  });

  it("merges several practice modules into one cell and keeps unmatched ones aside", () => {
    const heatmap = buildModuleHeatmap({
      modules: [
        insight("m004-no-arbitrage", { attempted: 4, correct: 1, accuracy: 25, due: 2, lastAttemptedAt: "2026-10-01T10:00:00Z" }),
        insight("m004-tvm-valuation", { attempted: 6, correct: 6, accuracy: 100, lastAttemptedAt: "2026-10-18T10:00:00Z" }),
        insight("module-01", { attempted: 3, correct: 3, accuracy: 100 }),
      ],
      taught: new Set(["cfa-2027-outline-m004"]),
      now: NOW,
    });
    const quant = heatmap.rows.find((row) => row.topic === "Quantitative Methods")!;
    const m004 = quant.cells.find((cell) => cell.label === "M004")!;
    expect(m004).toMatchObject({
      questionCount: 20, attempted: 10, correct: 7, accuracy: 70, due: 2, state: "building", taught: true,
      stale: false, lastAttemptedAt: "2026-10-18T10:00:00Z",
      practiceModuleIds: ["m004-no-arbitrage", "m004-tvm-valuation"],
    });
    expect(quant.practisedModules).toBe(1);
    expect(quant.accuracy).toBe(70);
    expect(heatmap.unmatched.map((item) => item.moduleId)).toEqual(["module-01"]);
    expect(heatmap.weightedAccuracy).toBe(70);
  });

  it("marks practice older than the stale window", () => {
    const heatmap = buildModuleHeatmap({
      modules: [insight("m001-returns", { attempted: 5, correct: 5, accuracy: 100, lastAttemptedAt: "2026-09-01T10:00:00Z" })],
      taught: new Set(),
      now: NOW,
    });
    const m001 = heatmap.rows.flatMap((row) => row.cells).find((cell) => cell.label === "M001")!;
    expect(m001.stale).toBe(true);
    expect(m001.state).toBe("ready");
  });

  it("counts a module as taught only after the tutor approves its session", () => {
    const tracker = createDefaultState();
    expect(taughtCatalogIds(tracker).size).toBe(0);
    const week = PLAN.find((candidate) => candidate.session1?.readings.length)!;
    const task = getPlanTasks(week).find((candidate) => candidate.kind === "session")!;
    const requestedAt = "2026-09-19T08:00:00.000Z";
    tracker.sessionCompletionRequests[task.id] = { taskId: task.id, requestedAt };
    expect(taughtCatalogIds(tracker).size).toBe(0);
    tracker.sessionCompletionReviews[task.id] = { taskId: task.id, requestedAt, reviewedAt: requestedAt, status: "approved", note: "" };
    expect([...taughtCatalogIds(tracker)]).toEqual(week.session1!.readings);
  });
});
