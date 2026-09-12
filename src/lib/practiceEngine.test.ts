import { describe, expect, it } from "vitest";
import {
  practiceAccuracy,
  selectPracticeQuestions,
  updatePracticeQuestionState,
} from "./practiceEngine";
import type { PracticeQuestion, PracticeQuestionState } from "./practiceContent";

const now = new Date("2026-09-12T09:00:00.000Z");
function question(id: string, conceptId = id): PracticeQuestion {
  return {
    id, moduleId: "returns", conceptId, type: "concept", difficulty: 3,
    estimatedSeconds: 60, prompt: `Question ${id}?`, options: ["A", "B", "C"],
    correctOption: 0, explanation: "Explanation", working: [], formulae: [],
    distractorExplanations: ["Correct", "Wrong", "Wrong"], examTrap: "Trap",
    tags: ["misconception"],
  };
}
function state(id: string, overrides: Partial<PracticeQuestionState> = {}): PracticeQuestionState {
  return {
    questionId: id, bankStorageId: "bank--v1", attempts: 2, correctAttempts: 1,
    streak: 0, lapseCount: 1, intervalDays: 0, ease: 2, lastCorrect: false,
    lastConfidence: 5, lastResponseMs: 90_000,
    lastAttemptedAt: "2026-09-11T09:00:00.000Z",
    dueAt: "2026-09-12T08:00:00.000Z", misconceptionTags: ["misconception"],
    updatedAtClient: "2026-09-11T09:00:00.000Z", ...overrides,
  };
}

describe("adaptive practice engine", () => {
  it("prioritizes an overconfident miss in the repair queue", () => {
    const questions = [question("weak"), question("strong")];
    const states = {
      weak: state("weak"),
      strong: state("strong", { correctAttempts: 2, streak: 2, lapseCount: 0, lastCorrect: true, lastConfidence: 4 }),
    };
    expect(selectPracticeQuestions({ questions, states, mode: "repair", count: 1, now })[0]?.id).toBe("weak");
  });

  it("diversifies concepts when equally valuable questions are available", () => {
    const questions = [question("a1", "a"), question("a2", "a"), question("b1", "b")];
    const selected = selectPracticeQuestions({ questions, states: {}, mode: "quick", count: 2, now });
    expect(new Set(selected.map(item => item.conceptId)).size).toBe(2);
  });

  it("shortens the interval after a miss and grows it after retained success", () => {
    const first = updatePracticeQuestionState({ question: question("q"), bankStorageId: "bank--v1", correct: false, confidence: 5, responseMs: 70_000, now });
    expect(first.intervalDays).toBe(.25);
    const recovered = updatePracticeQuestionState({ previous: first, question: question("q"), bankStorageId: "bank--v1", correct: true, confidence: 4, responseMs: 40_000, now });
    expect(recovered.intervalDays).toBe(1);
    expect(practiceAccuracy([recovered])).toBe(50);
  });
});
