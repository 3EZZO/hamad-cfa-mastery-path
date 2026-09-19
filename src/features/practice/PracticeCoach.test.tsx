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
  saveState: vi.fn(),
  saveRun: vi.fn(),
  cacheRun: vi.fn(),
  cacheState: vi.fn(),
  queueWrite: vi.fn(),
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

const unassignedBank: PublishedPracticeBank = {
  ...bank,
  id: "session-02-practice",
  storageId: "session-02-practice--v1",
  title: "Unassigned practice",
  questions: [{
    ...bank.questions[0],
    id: "question-unassigned",
    prompt: "This question must not appear in rehearsal.",
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
  listPublishedPracticeBanks: async () => [bank, unassignedBank],
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
  savePracticeQuestionState: harness.saveState,
  savePracticeRun: harness.saveRun,
}));

vi.mock("../../lib/practiceOffline", () => ({
  cachePracticeBanks: async () => {},
  cachePracticeRun: harness.cacheRun,
  cachePracticeState: harness.cacheState,
  loadCachedPracticeBanks: async () => [],
  loadCachedPracticeRuns: async () => [],
  loadCachedPracticeStates: async () => [],
  loadPendingPracticeWrites: async () => [],
  queuePracticeWrite: harness.queueWrite,
  removePendingPracticeWrite: async () => {},
}));

import { PracticeCoach } from "./PracticeCoach";

function renderedText(tree: ReactTestRenderer): string {
  return JSON.stringify(tree.toJSON());
}

function nodeText(node: { children?: Array<unknown> }): string {
  return (node.children ?? []).map(child => {
    if (typeof child === "string" || typeof child === "number") return String(child);
    if (child && typeof child === "object") return nodeText(child as { children?: Array<unknown> });
    return "";
  }).join("");
}

function button(tree: ReactTestRenderer, label: string) {
  return tree.root.findAllByType("button").find(candidate => nodeText(candidate).includes(label));
}

async function render(
  role: "tutor" | "student",
  uid: string,
  onComplete = vi.fn(),
  notify = vi.fn()
) {
  let tree!: ReactTestRenderer;
  await act(async () => {
    tree = create(
      <PracticeCoach
        uid={uid}
        role={role}
        manualLog={<div>Manual evidence</div>}
        onComplete={onComplete}
        notify={notify}
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
    harness.saveState.mockClear();
    harness.saveRun.mockClear();
    harness.cacheRun.mockClear();
    harness.cacheState.mockClear();
    harness.queueWrite.mockClear();
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

  it("preserves normal student persistence", async () => {
    const tree = await render("student", "student-uid");
    harness.saveState.mockClear();
    harness.saveRun.mockClear();
    harness.cacheState.mockClear();
    harness.cacheRun.mockClear();

    await act(async () => button(tree, "Quick 5")!.props.onClick());
    const firstAnswer = tree.root.findAllByProps({ role: "radio" })[0];
    await act(async () => firstAnswer.props.onClick());
    await act(async () => button(tree, "Submit answer")!.props.onClick());

    expect(harness.saveState).toHaveBeenCalledTimes(1);
    expect(harness.saveRun).toHaveBeenCalled();
    expect(harness.cacheState).toHaveBeenCalledTimes(1);
    expect(harness.cacheRun).toHaveBeenCalled();
    await act(async () => tree.unmount());
  });

  it("runs an assigned-only tutor rehearsal without persisting any activity", async () => {
    const onComplete = vi.fn();
    const notify = vi.fn();
    const tree = await render("tutor", "tutor-uid", onComplete, notify);
    harness.cacheRun.mockClear();
    harness.cacheState.mockClear();

    await act(async () => button(tree, "Rehearse as student")!.props.onClick());
    let text = renderedText(tree);
    expect(text).toContain("Tutor rehearsal");
    expect(text).toContain("Quick 5");
    expect(text).toContain("Mixed Review");
    expect(text).toContain("Exam Drill");
    expect(text).not.toContain("This question must not appear in rehearsal.");

    await act(async () => button(tree, "Quick 5")!.props.onClick());
    const firstAnswer = tree.root.findAllByProps({ role: "radio" })[0];
    await act(async () => firstAnswer.props.onClick());
    await act(async () => button(tree, "Submit answer")!.props.onClick());
    await act(async () => button(tree, "View results")!.props.onClick());

    text = renderedText(tree);
    expect(text).toContain("Rehearsal complete");
    expect(harness.saveState).not.toHaveBeenCalled();
    expect(harness.saveRun).not.toHaveBeenCalled();
    expect(harness.cacheState).not.toHaveBeenCalled();
    expect(harness.cacheRun).not.toHaveBeenCalled();
    expect(harness.queueWrite).not.toHaveBeenCalled();
    expect(onComplete).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalled();
    await act(async () => tree.unmount());
  });

  it("confirms before discarding an unfinished rehearsal", async () => {
    const tree = await render("tutor", "tutor-uid");
    await act(async () => button(tree, "Rehearse as student")!.props.onClick());
    await act(async () => button(tree, "Quick 5")!.props.onClick());
    await act(async () => button(tree, "Exit rehearsal")!.props.onClick());

    expect(renderedText(tree)).toContain("Discard this rehearsal?");
    await act(async () => button(tree, "Discard and exit")!.props.onClick());
    const text = renderedText(tree);
    expect(text).toContain("Hamad's practice evidence");
    expect(text).not.toContain("Tutor rehearsal");
    await act(async () => tree.unmount());
  });
});
