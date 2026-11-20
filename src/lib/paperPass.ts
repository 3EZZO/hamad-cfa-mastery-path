import { mockPaperById } from "../data/mockPapers";

/**
 * The pass rule for Mock Exam papers, in one place for every screen that shows
 * a paper result. Nothing is stored: the verdict follows from the saved score
 * and the question count frozen in the attempt, so it is the same after a
 * reload. The band compares the correct count with the pass mark and the
 * exam-ready mark; the percentage (two decimals) is only for display.
 */
export type PaperBand = "pass" | "ready" | "fail";

export interface PaperVerdict {
  /** Cleared the paper: at or above the pass mark. */
  passed: boolean;
  /** "pass" (cleared), "ready" (exam-ready, below the pass mark) or "fail". */
  band: PaperBand;
  correct: number;
  outOf: number;
  /** `correct / outOf × 100`, two decimals, e.g. "84.44". */
  percent: string;
  passCorrect: number;
  /** The pass mark as a percentage, e.g. "84.44". */
  passPercent: string;
  readyCorrect: number;
  /** The exam-ready mark as a percentage, e.g. "66.67". */
  readyPercent: string;
}

export function paperPercent(correct: number, outOf: number): string {
  return outOf > 0 ? ((correct / outOf) * 100).toFixed(2) : "0.00";
}

/** The pass mark of a registered paper, e.g. "84.44% (38/45)"; null for module tests. */
export function paperPassMarkLabel(moduleId: string): string | null {
  const pass = mockPaperById(moduleId)?.pass;
  return pass ? `${paperPercent(pass.correct, pass.outOf)}% (${pass.correct}/${pass.outOf})` : null;
}

/** The exam-ready mark of a registered paper, e.g. "66.67% (30/45)"; null for module tests. */
export function paperReadyMarkLabel(moduleId: string): string | null {
  const pass = mockPaperById(moduleId)?.pass;
  return pass ? `${paperPercent(pass.ready, pass.outOf)}% (${pass.ready}/${pass.outOf})` : null;
}

/**
 * Null when there is nothing to judge: a module test, a score still being
 * graded, or a paper attempt whose size differs from the one the pass mark is
 * defined for (such as an early 44-question attempt).
 */
export function paperVerdict(moduleId: string, score: number | null, questionCount: number): PaperVerdict | null {
  const pass = mockPaperById(moduleId)?.pass;
  if (!pass || score === null || questionCount !== pass.outOf) return null;
  const band: PaperBand = score >= pass.correct ? "pass" : score >= pass.ready ? "ready" : "fail";
  return {
    passed: band === "pass",
    band,
    correct: score,
    outOf: pass.outOf,
    percent: paperPercent(score, pass.outOf),
    passCorrect: pass.correct,
    passPercent: paperPercent(pass.correct, pass.outOf),
    readyCorrect: pass.ready,
    readyPercent: paperPercent(pass.ready, pass.outOf),
  };
}

const BAND_TITLE: Record<PaperBand, string> = { pass: "Passed", ready: "Exam-ready", fail: "Not passed" };

/** The heading of a paper result: "Passed", "Exam-ready" or "Not passed". */
export function paperVerdictTitle(verdict: PaperVerdict): string {
  return BAND_TITLE[verdict.band];
}

/** The message shown with a paper result (the owner's wording). */
export function paperVerdictMessage(verdict: PaperVerdict): string {
  switch (verdict.band) {
    case "pass":
      return "Congratulations! You’ve cleared this paper. Well done!";
    case "ready":
      return `Well done! You’ve reached exam-ready level on this paper. You need at least ${verdict.passCorrect} correct answers out of ${verdict.outOf} to clear it. Review the topics you found difficult with your tutor—we’ll work through them together.`;
    case "fail":
      return `Sorry, you haven’t cleared this paper yet. You need at least ${verdict.passCorrect} correct answers out of ${verdict.outOf} to pass. Review the topics you found difficult with your tutor—we’ll work through them together.`;
  }
}

export function paperScoreLine(verdict: PaperVerdict): string {
  return `Your score: ${verdict.correct}/${verdict.outOf} (${verdict.percent}%)`;
}

/** A short label for score lines in lists: " · Passed", " · Exam-ready", " · Not passed", or "". */
export function paperVerdictSuffix(moduleId: string, score: number | null, questionCount: number): string {
  const verdict = paperVerdict(moduleId, score, questionCount);
  return verdict ? ` · ${paperVerdictTitle(verdict)}` : "";
}
