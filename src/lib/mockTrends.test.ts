import { describe, expect, it } from "vitest";
import type { MockAttempt } from "./mockTestContent";
import { topicScoreTrends } from "./mockTrends";

function attempt(moduleId: string, score: number | null, at: number, status: MockAttempt["status"] = "submitted"): MockAttempt {
  return { id: `s_${moduleId}`, uid: "s", moduleId, status, score, submittedAtMs: status === "active" ? null : at } as MockAttempt;
}

describe("topicScoreTrends", () => {
  it("averages graded tests per topic and keeps the latest five in the order taken", () => {
    const trends = topicScoreTrends([
      attempt("m01-rates-and-returns", 4, 1),
      attempt("m02-time-value-of-money", 8, 2),
      attempt("m03-statistical-measures", 6, 3),
      attempt("m04-probability-trees", 7, 4),
      attempt("m05-portfolio-mathematics", 5, 5),
      attempt("m06-simulation-methods", 6, 6),
      attempt("m07-estimation-and-inference", null, 7), // awaiting grading
      attempt("m08-hypothesis-testing", 0, 8, "forfeited"),
      attempt("m09-parametric-nonparametric", null, 9, "active"),
      attempt("e03-fiscal-policy", 7, 10),
    ]);
    expect(trends.map(trend => trend.topic)).toEqual(["Quantitative Methods", "Economics"]);
    const [quant, econ] = trends;
    expect(quant.graded).toBe(6);
    expect(quant.averageScore).toBe(6);
    expect(quant.recent.map(score => `${score.code}:${score.score}`)).toEqual(["QM2:8", "QM3:6", "QM4:7", "QM5:5", "QM6:6"]);
    expect(econ).toMatchObject({ graded: 1, averageScore: 7, recent: [{ code: "EC3", title: "Fiscal Policy", score: 7 }] });
  });

  it("leaves out topics without a graded test", () => {
    expect(topicScoreTrends([attempt("e01-firm-and-market-structures", null, 1)])).toEqual([]);
  });
});
