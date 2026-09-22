import { describe, expect, it } from "vitest";
import {
  buildExamReport,
  examElapsedMs,
  examRemainingMs,
  examTimeLimitMs,
  formatClock,
} from "./examDrill";
import type { PracticeAnswerRecord, PracticeQuestion, PracticeRun } from "./practiceContent";

// Synthetic fixtures only.
function question(id: string, moduleId: string): PracticeQuestion {
  return {
    id, moduleId, conceptId: "c", type: "concept", difficulty: 3, estimatedSeconds: 90,
    prompt: "?", options: ["a", "b", "c"], correctOption: 0, explanation: "", working: [],
    formulae: [], distractorExplanations: ["", "", ""], examTrap: "", tags: [],
  };
}
function answer(questionId: string, correct: boolean, responseMs: number): PracticeAnswerRecord {
  return { questionId, selectedOption: correct ? 0 : 1, correct, confidence: 3, responseMs, answeredAt: "2026-10-01T09:00:00.000Z" };
}
function run(overrides: Partial<PracticeRun>): PracticeRun {
  return {
    id: "run", uid: "u", mode: "exam", bankStorageIds: ["b"], moduleId: null,
    questionIds: ["q1", "q2", "q3", "q4"], answers: [], currentIndex: 0, status: "active",
    startedAtClient: "2026-10-01T08:00:00.000Z", updatedAtClient: "2026-10-01T08:00:00.000Z", completedAtClient: null,
    ...overrides,
  };
}

describe("exam clock", () => {
  it("allows 90 seconds per question", () => {
    expect(examTimeLimitMs(20)).toBe(30 * 60_000);
    expect(examTimeLimitMs(0)).toBe(90_000);
  });

  it("counts only recorded response time plus the live question, never time away", () => {
    const active = run({ answers: [answer("q1", true, 40_000), answer("q2", false, 20_000)] });
    // Reopened two days later: the current question's clock restarts, the exam does not expire.
    expect(examElapsedMs(active, 1_000_000, 1_005_000)).toBe(65_000);
    expect(examElapsedMs(active, null, 9_999_999_999)).toBe(60_000);
    expect(examRemainingMs(active, 1_000_000, 1_005_000)).toBe(360_000 - 65_000);
    expect(examRemainingMs(active, 1_000_000, 1_000_000 + 600_000)).toBe(0);
  });

  it("ignores live time once the run is completed", () => {
    const done = run({ status: "completed", answers: [answer("q1", true, 40_000)] });
    expect(examElapsedMs(done, 0, 500_000)).toBe(40_000);
  });

  it("formats a countdown as m:ss, rounding up so 0:01 shows until zero", () => {
    expect(formatClock(30 * 60_000)).toBe("30:00");
    expect(formatClock(61_500)).toBe("1:02");
    expect(formatClock(900)).toBe("0:01");
    expect(formatClock(0)).toBe("0:00");
    expect(formatClock(-5)).toBe("0:00");
  });
});

describe("buildExamReport", () => {
  const questions = new Map([
    ["q1", question("q1", "m001")], ["q2", question("q2", "m001")],
    ["q3", question("q3", "m012")], ["q4", question("q4", "m012")],
  ]);
  const topics: Record<string, string> = { q1: "Quantitative Methods", q2: "Quantitative Methods", q3: "Economics", q4: "Economics" };

  it("groups by topic, counts unanswered as wrong and flags an expired run", () => {
    const expired = run({
      status: "completed", currentIndex: 4, completedAtClient: "2026-10-01T08:31:00.000Z",
      answers: [answer("q1", true, 50_000), answer("q2", false, 70_000), answer("q3", true, 60_000)],
    });
    const report = buildExamReport(expired, questions, (id) => topics[id]);
    expect(report).toMatchObject({ total: 4, answered: 3, correct: 2, unanswered: 1, expired: true, timeLimitMs: 360_000, elapsedMs: 180_000 });
    expect(report.sections).toEqual([
      { label: "Quantitative Methods", attempted: 2, correct: 1, unanswered: 0, averageResponseMs: 60_000, accuracy: 50 },
      { label: "Economics", attempted: 1, correct: 1, unanswered: 1, averageResponseMs: 60_000, accuracy: 50 },
    ]);
  });

  it("falls back to modules when every question shares a topic and is not expired when fully answered", () => {
    const finished = run({
      status: "completed", currentIndex: 4, completedAtClient: "2026-10-01T08:31:00.000Z",
      answers: [answer("q1", true, 1), answer("q2", true, 1), answer("q3", false, 1), answer("q4", true, 1)],
    });
    const report = buildExamReport(finished, questions, () => "Quantitative Methods");
    expect(report.expired).toBe(false);
    expect(report.sections.map((section) => [section.label, section.accuracy])).toEqual([["m001", 100], ["m012", 50]]);
  });

  it("labels unknown questions and topics as Practice rather than throwing", () => {
    const report = buildExamReport(run({ questionIds: ["zzz"] }), questions, () => undefined);
    expect(report.sections).toEqual([{ label: "Practice", attempted: 0, correct: 0, unanswered: 1, averageResponseMs: null, accuracy: 0 }]);
    expect(report.expired).toBe(false);
  });
});
