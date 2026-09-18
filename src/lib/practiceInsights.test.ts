import { describe, expect, it } from "vitest";
import { buildPracticeInsights } from "./practiceInsights";
import type {
  PracticeQuestion,
  PracticeQuestionState,
  PracticeRun,
} from "./practiceContent";

const question = (id: string, moduleId: string): PracticeQuestion => ({
  id,
  moduleId,
  conceptId: `${id}-concept`,
  type: "concept",
  difficulty: 3,
  estimatedSeconds: 60,
  prompt: `Prompt ${id}`,
  options: ["A", "B", "C"],
  correctOption: 1,
  explanation: "Explanation",
  working: [],
  formulae: [],
  distractorExplanations: ["No", "Correct", "No"],
  examTrap: "Trap",
  tags: ["tag"],
});

const state = (
  questionId: string,
  overrides: Partial<PracticeQuestionState> = {}
): PracticeQuestionState => ({
  questionId,
  bankStorageId: "bank--v1",
  attempts: 2,
  correctAttempts: 1,
  streak: 0,
  lapseCount: 1,
  intervalDays: 1,
  ease: 2,
  lastCorrect: false,
  lastConfidence: 4,
  lastResponseMs: 70_000,
  lastAttemptedAt: "2026-09-17T10:00:00.000Z",
  dueAt: "2026-09-18T09:00:00.000Z",
  misconceptionTags: ["tag"],
  updatedAtClient: "2026-09-17T10:00:00.000Z",
  ...overrides,
});

const run: PracticeRun = {
  id: "run-1",
  uid: "student-uid",
  mode: "quick",
  bankStorageIds: ["bank--v1"],
  moduleId: null,
  questionIds: ["q1", "q2"],
  answers: [
    {
      questionId: "q1",
      selectedOption: 0,
      correct: false,
      confidence: 4,
      responseMs: 80_000,
      answeredAt: "2026-09-17T10:00:00.000Z",
    },
    {
      questionId: "q2",
      selectedOption: 1,
      correct: true,
      confidence: 2,
      responseMs: 40_000,
      answeredAt: "2026-09-17T10:02:00.000Z",
    },
  ],
  currentIndex: 2,
  status: "completed",
  startedAtClient: "2026-09-17T09:58:00.000Z",
  updatedAtClient: "2026-09-17T10:02:00.000Z",
  completedAtClient: "2026-09-17T10:02:00.000Z",
};

describe("practice performance insights", () => {
  it("summarizes volume, accuracy, recency, confidence, and modules", () => {
    const insights = buildPracticeInsights({
      questions: [question("q1", "module-a"), question("q2", "module-b")],
      states: {
        q1: state("q1"),
        q2: state("q2", {
          attempts: 1,
          correctAttempts: 1,
          streak: 1,
          lapseCount: 0,
          lastCorrect: true,
        }),
      },
      runs: [run],
      now: new Date("2026-09-18T12:00:00.000Z"),
    });

    expect(insights.totalAttempts).toBe(3);
    expect(insights.accuracy).toBe(67);
    expect(insights.recentAccuracy).toBe(50);
    expect(insights.confidenceGaps).toBe(2);
    expect(insights.modules[0]).toMatchObject({ moduleId: "module-a", accuracy: 50 });
    expect(insights.recentRuns[0]).toMatchObject({ accuracy: 50, averageConfidence: 3 });
  });

  it("keeps the latest wrong answer and marks later recovery", () => {
    const recoveredRun: PracticeRun = {
      ...run,
      id: "run-2",
      answers: [{
        ...run.answers[0]!,
        answeredAt: "2026-09-16T10:00:00.000Z",
      }],
      questionIds: ["q1"],
      currentIndex: 1,
      completedAtClient: "2026-09-16T10:00:00.000Z",
    };
    const insights = buildPracticeInsights({
      questions: [question("q1", "module-a")],
      states: { q1: state("q1", { lastCorrect: true, streak: 2 }) },
      runs: [run, recoveredRun],
      now: new Date("2026-09-18T12:00:00.000Z"),
    });

    expect(insights.missedQuestions).toHaveLength(1);
    expect(insights.missedQuestions[0]).toMatchObject({
      selectedOption: 0,
      missCount: 2,
      recovered: true,
    });
  });
});
