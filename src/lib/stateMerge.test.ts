import { describe, expect, it } from "vitest";
import type {
  ErrorEntry,
  NoteEntry,
  PracticeLog,
  SessionLog,
  TrackerState,
} from "../types";
import {
  isStateMeaningfullyEmpty,
  mergeTrackerStates,
} from "./stateMerge";

function makeState(overrides: Partial<TrackerState> = {}): TrackerState {
  return {
    version: 1,
    updatedAt: "2026-08-01T00:00:00.000Z",
    taskCompletions: {},
    sessionCompletionRequests: {},
    sessionCompletionReviews: {},
    topicMastery: {},
    sessionLogs: [],
    practiceLogs: [],
    mockScores: [],
    errorEntries: [],
    notes: [],
    sessionOverrides: {},
    diagnostics: [],
    ...overrides,
  };
}

function practice(id: string, note: string): PracticeLog {
  return {
    id,
    date: "2026-08-10",
    topic: "Quantitative Methods",
    attempted: 30,
    correct: 24,
    source: "LES",
    note,
    confidence: 3,
  };
}

function note(id: string, title: string, body: string): NoteEntry {
  return {
    id,
    date: "2026-08-10",
    category: "Decision",
    title,
    body,
  };
}

function errorEntry(id: string, summary: string): ErrorEntry {
  return {
    id,
    date: "2026-08-10",
    topic: "Quantitative Methods",
    category: "Concept",
    summary,
    correction: "Review the rule.",
    revisitDate: "2026-08-17",
    resolved: false,
  };
}

function session(id: string, outcome: string): SessionLog {
  return {
    id,
    date: "2026-08-10",
    sessionNumber: 1,
    week: 1,
    type: "Tutoring",
    durationMinutes: 90,
    focus: "Returns",
    outcome,
    nextAction: "Complete practice.",
  };
}

describe("isStateMeaningfullyEmpty", () => {
  it("ignores timestamps, false tasks, and zero mastery", () => {
    const state = makeState({
      updatedAt: "2026-08-03T12:00:00.000Z",
      taskCompletions: { "week-1-session-1": false },
      topicMastery: { "Quantitative Methods": 0 },
    });

    expect(isStateMeaningfullyEmpty(state)).toBe(true);
  });

  it("recognizes map progress and array records", () => {
    expect(
      isStateMeaningfullyEmpty(
        makeState({ taskCompletions: { "week-1-session-1": true } }),
      ),
    ).toBe(false);
    expect(
      isStateMeaningfullyEmpty(
        makeState({ topicMastery: { "Quantitative Methods": 1 } }),
      ),
    ).toBe(false);
    expect(isStateMeaningfullyEmpty(makeState({ notes: [note("n1", "Plan", "Start")] }))).toBe(false);
    expect(isStateMeaningfullyEmpty(makeState({
      sessionCompletionRequests: {
        "w1-session-1": {
          taskId: "w1-session-1",
          requestedAt: "2026-08-19T10:00:00.000Z",
        },
      },
    }))).toBe(false);
  });
});

describe("mergeTrackerStates", () => {
  it("merges task and mastery maps by locally changed keys", () => {
    const base = makeState({
      taskCompletions: { session1: false, session2: true },
      topicMastery: { Quant: 10, Equity: 0 },
    });
    const local = makeState({
      taskCompletions: { session1: true, session2: true },
      topicMastery: { Quant: 10, Equity: 30 },
    });
    const remote = makeState({
      taskCompletions: { session1: false, session2: false, session3: true },
      topicMastery: { Quant: 55, Equity: 0, FixedIncome: 25 },
    });

    const merged = mergeTrackerStates(base, local, remote);

    expect(merged.taskCompletions).toEqual({
      session1: true,
      session2: false,
      session3: true,
    });
    expect(merged.topicMastery).toEqual({
      Quant: 55,
      Equity: 30,
      FixedIncome: 25,
    });
  });

  it("applies local map-key deletions without removing remote-only keys", () => {
    const base = makeState({
      taskCompletions: { removedLocally: true, unchanged: true },
    });
    const local = makeState({ taskCompletions: { unchanged: true } });
    const remote = makeState({
      taskCompletions: {
        removedLocally: false,
        unchanged: false,
        remoteOnly: true,
      },
    });

    expect(mergeTrackerStates(base, local, remote).taskCompletions).toEqual({
      unchanged: false,
      remoteOnly: true,
    });
  });

  it("keeps concurrent additions from both local and remote devices", () => {
    const localEntry = practice("local", "Added on Hamad's device");
    const remoteEntry = practice("remote", "Added on Mohamed's device");

    const merged = mergeTrackerStates(
      makeState(),
      makeState({ practiceLogs: [localEntry] }),
      makeState({ practiceLogs: [remoteEntry] }),
    );

    expect(merged.practiceLogs).toEqual([remoteEntry, localEntry]);
  });

  it("merges different fields edited concurrently on the same record", () => {
    const baseNote = note("n1", "Original title", "Original body");
    const localNote = { ...baseNote, body: "Body edited locally" };
    const remoteNote = { ...baseNote, title: "Title edited remotely" };

    const merged = mergeTrackerStates(
      makeState({ notes: [baseNote] }),
      makeState({ notes: [localNote] }),
      makeState({ notes: [remoteNote] }),
    );

    expect(merged.notes).toEqual([
      {
        ...baseNote,
        title: "Title edited remotely",
        body: "Body edited locally",
      },
    ]);
  });

  it("lets the local value win when both sides edit the same field", () => {
    const baseError = errorEntry("e1", "Original summary");
    const localError = { ...baseError, summary: "Local correction" };
    const remoteError = { ...baseError, summary: "Remote correction" };

    const merged = mergeTrackerStates(
      makeState({ errorEntries: [baseError] }),
      makeState({ errorEntries: [localError] }),
      makeState({ errorEntries: [remoteError] }),
    );

    expect(merged.errorEntries[0].summary).toBe("Local correction");
  });

  it("honors local deletions while retaining unrelated remote edits and additions", () => {
    const deletedBase = practice("delete-me", "Original");
    const retainedBase = practice("retain", "Original retained note");
    const remoteAddition = practice("remote-addition", "New remote work");
    const remoteEditedDeleted = {
      ...deletedBase,
      note: "Remote edit on the deleted record",
    };
    const remoteEditedRetained = {
      ...retainedBase,
      note: "Remote edit that should remain",
    };

    const merged = mergeTrackerStates(
      makeState({ practiceLogs: [deletedBase, retainedBase] }),
      makeState({ practiceLogs: [retainedBase] }),
      makeState({
        practiceLogs: [
          remoteEditedDeleted,
          remoteEditedRetained,
          remoteAddition,
        ],
      }),
    );

    expect(merged.practiceLogs).toEqual([
      remoteEditedRetained,
      remoteAddition,
    ]);
  });

  it("retains a local edit when the corresponding record was deleted remotely", () => {
    const baseSession = session("s1", "Original outcome");
    const localSession = { ...baseSession, outcome: "Locally refined outcome" };

    const merged = mergeTrackerStates(
      makeState({ sessionLogs: [baseSession] }),
      makeState({ sessionLogs: [localSession] }),
      makeState(),
    );

    expect(merged.sessionLogs).toEqual([localSession]);
  });

  it("preserves the remote state exactly when local has no meaningful diff", () => {
    const baseNote = note("n1", "Base", "No local change");
    const base = makeState({
      updatedAt: "2026-08-01T00:00:00.000Z",
      taskCompletions: { session1: true },
      topicMastery: { Quant: 10 },
      notes: [baseNote],
    });
    const local = {
      ...base,
      updatedAt: "2026-08-02T00:00:00.000Z",
      taskCompletions: { ...base.taskCompletions },
      topicMastery: { ...base.topicMastery },
      notes: [{ ...baseNote }],
    };
    const remote = makeState({
      updatedAt: "2026-08-03T00:00:00.000Z",
      taskCompletions: { session1: false, remoteTask: true },
      topicMastery: { Quant: 40, Equity: 20 },
      notes: [
        { ...baseNote, title: "Remote title" },
        note("n2", "Remote addition", "Keep me"),
      ],
    });

    expect(mergeTrackerStates(base, local, remote)).toEqual(remote);
  });

  it("retains a remote session review when the local object is unchanged", () => {
    const baseReview = {
      taskId: "w1-session-1",
      requestedAt: "2026-08-19T10:00:00.000Z",
      status: "returned" as const,
      reviewedAt: "2026-08-19T11:00:00.000Z",
      note: "Review",
    };
    const approvedReview = { ...baseReview, status: "approved" as const };
    const merged = mergeTrackerStates(
      makeState({ sessionCompletionReviews: { [baseReview.taskId]: baseReview } }),
      makeState({ sessionCompletionReviews: { [baseReview.taskId]: { ...baseReview } } }),
      makeState({ sessionCompletionReviews: { [baseReview.taskId]: approvedReview } }),
    );
    expect(merged.sessionCompletionReviews[baseReview.taskId]).toEqual(approvedReview);
  });

  it("merges tutor schedule overrides and diagnostics without losing remote evidence", () => {
    const base = makeState();
    const local = makeState({
      sessionOverrides: {
        "2": {
          sessionNumber: 2,
          date: "2026-08-24",
          reason: "Travel",
          updatedAt: "2026-08-13T00:00:00.000Z",
        },
      },
      diagnostics: [{
        id: "d1",
        date: "2026-08-19",
        sessionNumber: 1,
        status: "final",
        attempted: 30,
        correct: 22,
        studyHoursPerWeek: 12,
        pacingRating: 3,
        confidenceRating: 3,
        calculatorReady: true,
        priorityTopics: ["Quantitative Methods"],
        strengths: "Persistence",
        barriers: "Pacing",
        tutorPlan: "Timed retrieval",
      }],
    });
    const remotePractice = practice("remote", "Keep this evidence");
    const merged = mergeTrackerStates(
      base,
      local,
      makeState({ practiceLogs: [remotePractice] }),
    );
    expect(merged.sessionOverrides["2"]?.date).toBe("2026-08-24");
    expect(merged.diagnostics[0]?.status).toBe("final");
    expect(merged.practiceLogs).toEqual([remotePractice]);
  });
});
