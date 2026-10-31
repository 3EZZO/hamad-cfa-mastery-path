import { describe, expect, it } from "vitest";
import { MOCK_PAPERS } from "../data/mockPapers";
import { paperPassMarkLabel, paperScoreLine, paperVerdict, paperVerdictMessage, paperVerdictSuffix } from "./paperPass";

describe("Mock Exam pass mark", () => {
  it("is 38 of 45 on every paper", () => {
    for (const paper of MOCK_PAPERS) expect(paper.pass).toEqual({ correct: 38, outOf: 45 });
    expect(paperPassMarkLabel("qm-paper-01")).toBe("84.44% (38/45)");
    expect(paperPassMarkLabel("m01")).toBeNull();
  });

  it.each([
    [37, "82.22", false],
    [38, "84.44", true],
    [45, "100.00", true],
    [0, "0.00", false],
  ])("judges %i/45 as %s%% on the correct count", (score, percent, passed) => {
    const verdict = paperVerdict("qm-paper-01", score, 45)!;
    expect(verdict.percent).toBe(percent);
    expect(verdict.passed).toBe(passed);
    expect(paperScoreLine(verdict)).toBe(`Your score: ${score}/45 (${percent}%)`);
    expect(paperVerdictSuffix("qm-paper-01", score, 45)).toBe(passed ? " · Passed" : " · Not passed");
  });

  it("shows the owner's messages", () => {
    expect(paperVerdictMessage(paperVerdict("ec-paper-01", 38, 45)!)).toBe("Congratulations! You’ve cleared this paper. Well done!");
    expect(paperVerdictMessage(paperVerdict("ec-paper-01", 37, 45)!)).toBe(
      "Sorry, you haven’t cleared this paper yet. You need at least 38 correct answers out of 45 to pass. "
      + "Review the topics you found difficult with your tutor—we’ll work through them together.",
    );
  });

  it("gives no verdict for module tests, ungraded scores or other paper sizes", () => {
    expect(paperVerdict("m01", 8, 8)).toBeNull();
    expect(paperVerdict("qm-paper-01", null, 45)).toBeNull();
    expect(paperVerdict("qm-paper-01", 40, 44)).toBeNull();
    expect(paperVerdictSuffix("qm-paper-01", 40, 44)).toBe("");
  });
});
