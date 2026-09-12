import { describe, expect, it } from "vitest";
import {
  assertIndependentPracticeQuestions,
  parsePracticeBankDraft,
  parsePracticeQuestionState,
  parsePracticeRun,
  PracticeContentError,
  type PracticeBankDraft,
} from "./practiceContent";

function bank(): PracticeBankDraft {
  return {
    schemaVersion: 1,
    id: "session-01-practice",
    version: "v1",
    title: "Session 01 independent practice",
    topic: "Quantitative Methods",
    moduleIds: ["returns"],
    sourceSessionIds: ["session-01"],
    questions: Array.from({ length: 5 }, (_, index) => ({
      id: `return-${index + 1}`,
      moduleId: "returns",
      conceptId: `holding-period-return-${index + 1}`,
      type: "calculation" as const,
      difficulty: 3 as const,
      estimatedSeconds: 90,
      prompt: `An investment scenario ${index + 1} has a distinct set of cash flows. Which return measure is appropriate?`,
      options: ["Holding-period return", "Harmonic mean", "Population variance"] as [string, string, string],
      correctOption: 0 as const,
      explanation: "Holding-period return incorporates price change and income over the stated period.",
      working: ["Identify the beginning value.", "Add income to the ending-value change."],
      formulae: ["HPR = (P1 - P0 + D1) / P0"],
      distractorExplanations: ["This is correct.", "The harmonic mean answers a different averaging question.", "Variance measures dispersion."],
      examTrap: "Do not omit income received during the holding period.",
      tags: ["income-omission"],
    })),
  };
}

describe("student-safe practice content", () => {
  it("accepts a complete independently authored three-option bank", () => {
    expect(parsePracticeBankDraft(bank()).questions).toHaveLength(5);
  });

  it("rejects tutor-only fields at any depth", () => {
    const unsafe = bank() as unknown as Record<string, unknown>;
    (unsafe.questions as Array<Record<string, unknown>>)[0]!.privateTutorNote = "Do not show Hamad.";
    expect(() => parsePracticeBankDraft(unsafe)).toThrow(PracticeContentError);
  });

  it("rejects duplicate prompts and near-copies of Session Mode prompts", () => {
    const duplicate = bank();
    duplicate.questions[1]!.prompt = duplicate.questions[0]!.prompt;
    expect(() => parsePracticeBankDraft(duplicate)).toThrow(/duplicate question prompts/i);
    expect(() => assertIndependentPracticeQuestions(bank(), [
      "An investment scenario 1 has a distinct set of cash flows. Which return measure is appropriate?",
    ])).toThrow(/too similar/i);
  });

  it("rejects impossible state counters and invalid run positions", () => {
    const timestamp = "2026-09-12T09:00:00.000Z";
    expect(() => parsePracticeQuestionState({
      questionId: "return-1", bankStorageId: "bank--v1", attempts: 1,
      correctAttempts: 2, streak: 0, lapseCount: 0, intervalDays: 1,
      ease: 2.3, lastCorrect: true, lastConfidence: 3, lastResponseMs: 20_000,
      lastAttemptedAt: timestamp, dueAt: timestamp, misconceptionTags: [],
      updatedAtClient: timestamp,
    })).toThrow(/counters/i);
    expect(() => parsePracticeRun({
      id: "run-1", uid: "student", mode: "quick", bankStorageIds: ["bank--v1"],
      moduleId: null, questionIds: ["return-1"], answers: [], currentIndex: Number.NaN,
      status: "active", startedAtClient: timestamp, updatedAtClient: timestamp,
      completedAtClient: null,
    })).toThrow(/currentIndex/i);
  });
});
