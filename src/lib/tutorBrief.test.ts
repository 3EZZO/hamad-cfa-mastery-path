import { describe, expect, it } from "vitest";
import type { MockAttempt } from "./mockTestContent";
import type { PracticeAnswerRecord, PracticeQuestion, PracticeRun } from "./practiceContent";
import { createDefaultState } from "./storage";
import { briefWindowStart, buildTutorBrief } from "./tutorBrief";

const TODAY = "2026-10-03";

function question(id: string, moduleId: string, prompt = `Prompt ${id}`): PracticeQuestion {
  return { id, moduleId, prompt } as unknown as PracticeQuestion;
}

function answer(questionId: string, correct: boolean, answeredAt: string): PracticeAnswerRecord {
  return { questionId, selectedOption: 0, correct, confidence: 3, responseMs: 30_000, answeredAt };
}

function run(id: string, answers: PracticeAnswerRecord[]): PracticeRun {
  return { id, uid: "student-1", mode: "quick", moduleId: null, answers, status: "completed" } as unknown as PracticeRun;
}

function attempt(moduleId: string, submittedAt: string | null, score: number | null, uid = "student-1"): MockAttempt {
  return {
    id: `${uid}_${moduleId}`, uid, moduleId, status: submittedAt ? "submitted" : "active",
    submittedAtMs: submittedAt ? Date.parse(submittedAt) : null, score,
  } as unknown as MockAttempt;
}

describe("tutor brief window", () => {
  it("starts from the last logged session before today, else seven days back", () => {
    const tracker = createDefaultState();
    expect(briefWindowStart(tracker, TODAY)).toEqual({ since: "2026-09-26", source: "seven-days" });
    tracker.sessionLogs = [
      { date: "2026-09-19" } as never,
      { date: "2026-09-26" } as never,
      { date: TODAY } as never, // today's own log does not count as "last lesson"
    ];
    expect(briefWindowStart(tracker, TODAY)).toEqual({ since: "2026-09-26", source: "last-session" });
  });
});

describe("buildTutorBrief", () => {
  const tracker = createDefaultState();
  tracker.sessionLogs = [{ date: "2026-09-26" } as never];

  const brief = buildTutorBrief({
    tracker,
    today: TODAY,
    studentUid: "student-1",
    questions: [question("q1", "m001-returns"), question("q2", "m001-returns"), question("q3", "m004-tvm")],
    runs: [
      run("old", [answer("q1", false, "2026-09-20T10:00:00Z")]),
      run("new", [
        answer("q1", false, "2026-09-28T10:00:00Z"),
        answer("q1", false, "2026-09-29T10:00:00Z"),
        answer("q2", true, "2026-09-29T10:01:00Z"),
        answer("q3", true, "2026-09-30T10:00:00Z"),
        answer("gone", false, "2026-09-30T10:05:00Z"),
      ]),
    ],
    mockAttempts: [
      attempt("m01-rates-and-returns", "2026-09-30T12:00:00Z", 6),
      attempt("m02-time-value-of-money", "2026-09-20T12:00:00Z", 5),
      attempt("m03-statistical-measures", null, null),
      attempt("m01-rates-and-returns", "2026-09-30T12:00:00Z", 8, "someone-else"),
    ],
  });

  it("counts only practice inside the window", () => {
    expect(brief.since).toBe("2026-09-26");
    expect(brief.practice).toMatchObject({ runs: 1, answered: 5, correct: 2, accuracy: 40 });
  });

  it("lists modules weakest first, including answers whose question is gone", () => {
    expect(brief.practice.byModule.map((line) => [line.moduleId, line.accuracy])).toEqual([
      ["Unlisted", 0],
      ["m001-returns", 33],
      ["m004-tvm", 100],
    ]);
  });

  it("ranks the most-missed questions with their prompt", () => {
    expect(brief.topMisses[0]).toEqual({ questionId: "q1", moduleId: "m001-returns", prompt: "Prompt q1", misses: 2 });
    expect(brief.topMisses[1]).toMatchObject({ questionId: "gone", moduleId: null, prompt: null, misses: 1 });
  });

  it("reports only this student's module tests submitted in the window", () => {
    expect(brief.moduleTests).toEqual([
      expect.objectContaining({ moduleId: "m01-rates-and-returns", title: "Rates and Returns", score: 6, outOf: 8 }),
    ]);
  });

  it("includes overdue work and coaching signals from the tracker", () => {
    expect(brief.overdue.count).toBeGreaterThan(0);
    expect(brief.overdue.oldest.length).toBeLessThanOrEqual(3);
    expect(brief.signals.every((signal) => signal.tone !== "green")).toBe(true);
  });
});
