import { describe, expect, it } from "vitest";
import { MOCK_PAPERS } from "../data/mockPapers";
import {
  paperPassMarkLabel,
  paperReadyMarkLabel,
  paperScoreLine,
  paperVerdict,
  paperVerdictMessage,
  paperVerdictSuffix,
  paperVerdictTitle,
} from "./paperPass";

describe("Mock Exam pass mark", () => {
  it("is 38 of 45 on every paper, with exam-ready from 30", () => {
    for (const paper of MOCK_PAPERS) expect(paper.pass).toEqual({ correct: 38, ready: 30, outOf: 45 });
    expect(paperPassMarkLabel("qm-paper-01")).toBe("84.44% (38/45)");
    expect(paperReadyMarkLabel("qm-paper-01")).toBe("66.67% (30/45)");
    expect(paperPassMarkLabel("m01")).toBeNull();
    expect(paperReadyMarkLabel("m01")).toBeNull();
  });

  it.each([
    [0, "0.00", "fail", "Not passed"],
    [29, "64.44", "fail", "Not passed"],
    [30, "66.67", "ready", "Exam-ready"],
    [37, "82.22", "ready", "Exam-ready"],
    [38, "84.44", "pass", "Passed"],
    [45, "100.00", "pass", "Passed"],
  ])("judges %i/45 (%s%%) as %s on the correct count", (score, percent, band, title) => {
    const verdict = paperVerdict("qm-paper-01", score, 45)!;
    expect(verdict.percent).toBe(percent);
    expect(verdict.band).toBe(band);
    expect(verdict.passed).toBe(band === "pass");
    expect(paperVerdictTitle(verdict)).toBe(title);
    expect(paperScoreLine(verdict)).toBe(`Your score: ${score}/45 (${percent}%)`);
    expect(paperVerdictSuffix("qm-paper-01", score, 45)).toBe(` · ${title}`);
  });

  it("shows the owner's messages", () => {
    expect(paperVerdictMessage(paperVerdict("ec-paper-01", 38, 45)!)).toBe("Congratulations! You’ve cleared this paper. Well done!");
    const ready = "Well done! You’ve reached exam-ready level on this paper. You need at least 38 correct answers out of 45 to clear it. "
      + "Review the topics you found difficult with your tutor—we’ll work through them together.";
    expect(paperVerdictMessage(paperVerdict("ec-paper-01", 37, 45)!)).toBe(ready);
    expect(paperVerdictMessage(paperVerdict("ec-paper-01", 30, 45)!)).toBe(ready);
    expect(paperVerdictMessage(paperVerdict("ec-paper-01", 29, 45)!)).toBe(
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
