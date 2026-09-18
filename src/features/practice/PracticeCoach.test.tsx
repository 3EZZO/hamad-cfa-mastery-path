import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  PracticeQuestionState,
  PracticeRun,
  PublishedPracticeBank,
} from "../../lib/practiceContent";

const harness = vi.hoisted(() => ({
  loadedStateUid: "",
  loadedRunUid: "",
  rosterCalls: 0,
}));

const bank: PublishedPracticeBank = {
  schemaVersion: 1,
  id: "session-01-practice",
  version: "v1",
  storageId: "session-01-practice--v1",
  title: "Session 1 practice",
  topic: "Quantitative Methods",
  moduleIds: ["module-01"],
  sourceSessionIds: ["session-01"],
  published: true,
  publishedBy: "tutor-uid",
  publishedAtClient: "2026-09-01T08:00:00.000Z",
  questions: [{
    id: "question-01",
    moduleId: "module-01",
    conceptId: "concept-01",
    type: "concept",
    difficulty: 3,
    estimatedSeconds: 60,
    prompt: "Which return measure preserves compounded wealth?",
    options: ["Arithmetic mean", "Geometric mean", "Harmonic mean"],
    correctOption: 1,
    explanation: "The geometric mean preserves the compounded wealth path.",
    working: [],
    formulae: [],
    distractorExplanations: ["It does not compound.", "Correct.", "It answers a different question."],
    examTrap: "Do not substitute an arithmetic average for compounded growth.",
    tags: ["return-measures"],
  }],
};

const state: PracticeQuestionState = {
  questionId: "question-01",
  bankStorageId: bank.storageId,
  attempts: 1,
  correctAttempts: 0,
  streak: 0,
  lapseCount: 1,
  intervalDays: 1,
  ease: 2,
  lastCorrect: false,
  lastConfidence: 4,
  lastResponseMs: 80_000,
  lastAttemptedAt: "2026-09-17T10:00:00.000Z",
  dueAt: "2026-09-18T10:00:00.000Z",
  misconceptionTags: ["return-measures"],
  updatedAtClient: "2026-09-17T10:00:00.000Z",
};

const run: PracticeRun = {
  id: "run-01",
  uid: "student-uid",
  mode: "quick",
  bankStorageIds: [bank.storageId],
  moduleId: null,
  questionIds: ["question-01"],
  answers: [{
    questionId: "question-01",
    selectedOption: 0,
    correct: false,
    confidence: 4,
    responseMs: 80_000,
    answeredAt: "2026-09-17T10:00:00.000Z",
  }],
  currentIndex: 1,
  status: "completed",
  startedAtClient: "2026-09-17T09:58:00.000Z",
  updatedAtClient: "2026-09-17T10:00:00.000Z",
  completedAtClient: "2026-09-17T10:00:00.000Z",
};

vi.mock("../../lib/cloud", () => ({
  listActiveStudentMembers: async () => {
    harness.rosterCalls += 1;
    return [{ uid: "student-uid", role: "student", active: true }];
  },
  listPublishedPracticeBanks: async () => [bank],
  loadPracticeAssignment: async () => ({
    bankStorageIds: [bank.storageId],
    updatedBy: "tutor-uid",
    updatedAtClient: "2026-09-01T08:00:00.000Z",
  }),
  loadPracticeQuestionStates: async (uid: string) => {
    harness.loadedStateUid = uid;
    return [state];
  },
  listPracticeRuns: async (uid: string) => {
    harness.loadedRunUid = uid;
    return [{ ...run, uid }];
  },
  savePracticeQuestionState: vi.fn(),
  savePracticeRun: vi.fn(),
}));

vi.mock("../../lib/practiceOffline", () => ({
  cachePracticeBanks: async () => {},
  cachePracticeRun: async () => {},
  cachePracticeState: async () => {},
  loadCachedPracticeBanks: async () => [],
  loadCachedPracticeRuns: async () => [],
  loadCachedPracticeStates: async () => [],
  loadPendingPracticeWrites: async () => [],
  queuePracticeWrite: async () => {},
  removePendingPracticeWrite: async () => {},
}));

import { PracticeCoach } from "./PracticeCoach";

function renderedText(tree: ReactTestRenderer): string {
  return JSON.stringify(tree.toJSON());
}

async function render(role: "tutor" | "student", uid: string) {
  let tree!: ReactTestRenderer;
  await act(async () => {
    tree = create(
      <PracticeCoach
        uid={uid}
        role={role}
        manualLog={<div>Manual evidence</div>}
        onComplete={() => {}}
        notify={() => {}}
      />
    );
    await Promise.resolve();
    await Promise.resolve();
  });
  return tree;
}

describe("Practice Coach role views", () => {
  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    vi.stubGlobal("window", {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });
    harness.loadedStateUid = "";
    harness.loadedRunUid = "";
    harness.rosterCalls = 0;
  });

  afterEach(() => vi.unstubAllGlobals());

  it("shows the tutor Hamad's read-only performance and missed answer", async () => {
    const tree = await render("tutor", "tutor-uid");
    const text = renderedText(tree);

    expect(harness.rosterCalls).toBe(1);
    expect(harness.loadedStateUid).toBe("student-uid");
    expect(harness.loadedRunUid).toBe("student-uid");
    expect(text).toContain("Hamad's practice evidence");
    expect(text).toContain("Questions answered incorrectly");
    expect(text).toContain("Which return measure preserves compounded wealth?");
    expect(text).not.toContain("Recommended now");
    await act(async () => tree.unmount());
  });

  it("shows the student personal review alongside practice actions", async () => {
    const tree = await render("student", "student-uid");
    const text = renderedText(tree);

    expect(harness.rosterCalls).toBe(0);
    expect(harness.loadedStateUid).toBe("student-uid");
    expect(text).toContain("Your evidence");
    expect(text).toContain("Recommended now");
    expect(text).toContain("Which return measure preserves compounded wealth?");
    await act(async () => tree.unmount());
  });
});
