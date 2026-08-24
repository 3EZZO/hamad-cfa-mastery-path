import { describe, expect, it } from "vitest";
import { TOPICS } from "../data/plan";
import { cascadeReschedule } from "./schedule";
import { createDefaultState, normalizeState } from "./storage";

describe("tracker backup invariants", () => {
  it("creates a mastery field for every curriculum topic", () => {
    const state = createDefaultState();
    expect(Object.keys(state.topicMastery)).toEqual([...TOPICS]);
  });

  it("rejects unknown backup versions", () => {
    expect(() => normalizeState({ version: 2 })).toThrow(/version 1/i);
  });

  it("clamps imported mastery values", () => {
    const state = normalizeState({
      ...createDefaultState(),
      topicMastery: {
        [TOPICS[0]]: 140,
        [TOPICS[1]]: -20,
      },
    });
    expect(state.topicMastery[TOPICS[0]]).toBe(100);
    expect(state.topicMastery[TOPICS[1]]).toBe(0);
  });

  it("upgrades older version 1 backups with new safe defaults", () => {
    const legacy = createDefaultState();
    const {
      scheduleVersion: _scheduleVersion,
      sessionOverrides: _overrides,
      diagnostics: _diagnostics,
      sessionCompletionRequests: _requests,
      sessionCompletionReviews: _reviews,
      ...oldState
    } = legacy;
    const normalized = normalizeState(oldState);
    expect(normalized.sessionOverrides).toEqual({});
    expect(normalized.diagnostics).toEqual([]);
    expect(normalized.sessionCompletionRequests).toEqual({});
    expect(normalized.sessionCompletionReviews).toEqual({});
  });

  it("clears stale schedule-linked progress when migrating to weekly Saturdays", () => {
    const legacy = {
      ...createDefaultState(),
      scheduleVersion: undefined,
      taskCompletions: { "w1-session-1": true, "w1-independent-1": true },
      sessionLogs: [{
        id: "legacy-session",
        date: "2026-08-26",
        sessionNumber: 1,
        week: 1,
        type: "Tutor session",
        durationMinutes: 90,
        focus: "Old plan",
        outcome: "Test data",
        nextAction: "None",
      }],
      practiceLogs: [{
        id: "independent-evidence",
        date: "2026-08-20",
        topic: "Quantitative Methods",
        attempted: 20,
        correct: 14,
        source: "LES",
        note: "Preserve independent evidence",
        confidence: 3,
      }],
    };
    const normalized = normalizeState(legacy);
    expect(normalized.scheduleVersion).toBe("weekly-saturday-v2");
    expect(normalized.taskCompletions).toEqual({});
    expect(normalized.sessionLogs).toEqual([]);
    expect(normalized.practiceLogs).toHaveLength(1);
  });

  it("normalizes tutor-controlled schedule and diagnostic records", () => {
    const validOverrides = cascadeReschedule(
      {},
      2,
      "2026-09-11",
      "Travel",
      "2026-08-13T00:00:00.000Z",
    ).overrides;
    const normalized = normalizeState({
      ...createDefaultState(),
      sessionOverrides: {
        ...validOverrides,
        invalid: { date: "not-a-date" },
      },
      diagnostics: [{
        id: "d1",
        date: "2026-09-05",
        status: "final",
        attempted: 30,
        correct: 22,
        studyHoursPerWeek: 12,
        pacingRating: 3,
        confidenceRating: 4,
        calculatorReady: true,
        priorityTopics: ["Quantitative Methods"],
        strengths: "Persistent",
        barriers: "Pacing",
        tutorPlan: "Weekly timed sets",
      }],
    });
    expect(normalized.sessionOverrides["2"]?.reason).toBe("Travel");
    expect(normalized.sessionOverrides.invalid).toBeUndefined();
    expect(normalized.diagnostics[0]).toMatchObject({
      sessionNumber: 1,
      status: "final",
      correct: 22,
    });
  });

  it("filters malformed records and clamps UI-facing numeric and text fields", () => {
    const longText = "x".repeat(2_500);
    const normalized = normalizeState({
      ...createDefaultState(),
      taskCompletions: { valid: true, truthyString: "yes" },
      sessionLogs: [
        {
          id: "session-1",
          date: "2026-09-05",
          sessionNumber: 1,
          week: 999,
          type: 42,
          durationMinutes: 9_999,
          focus: longText,
          outcome: longText,
          nextAction: longText,
        },
        { id: "bad-session", date: "2026-02-30", sessionNumber: 1 },
      ],
      practiceLogs: [
        {
          id: "practice-1",
          date: "2026-08-20",
          topic: TOPICS[0],
          attempted: "30",
          correct: 80,
          source: longText,
          note: longText,
          confidence: 99,
        },
        {
          id: "wrong-topic",
          date: "2026-08-20",
          topic: "Unknown topic",
          attempted: 10,
          correct: 5,
        },
        null,
      ],
      mockScores: [
        {
          id: "mock-1",
          date: "2026-12-20",
          label: longText,
          score: 250,
          note: longText,
        },
      ],
      errorEntries: [
        {
          id: "error-1",
          date: "2026-08-20",
          topic: TOPICS[1],
          category: "Injected category",
          summary: longText,
          correction: longText,
          revisitDate: "2026-13-01",
          resolved: "true",
        },
      ],
      notes: [
        {
          id: "note-1",
          date: "2026-08-20",
          category: "Injected category",
          title: longText,
          body: longText,
        },
        { id: "note-2", date: {} },
      ],
    });

    expect(normalized.taskCompletions).toEqual({ valid: true });
    expect(normalized.sessionLogs).toHaveLength(1);
    expect(normalized.sessionLogs[0]).toMatchObject({
      week: 1,
      type: "Tutor session",
      durationMinutes: 240,
    });
    expect(normalized.sessionLogs[0]?.focus).toHaveLength(120);
    expect(normalized.practiceLogs).toHaveLength(1);
    expect(normalized.practiceLogs[0]).toMatchObject({
      attempted: 30,
      correct: 30,
      confidence: 5,
    });
    expect(normalized.mockScores[0]).toMatchObject({ score: 100 });
    expect(normalized.mockScores[0]?.label).toHaveLength(50);
    expect(normalized.errorEntries[0]).toMatchObject({
      category: "Concept gap",
      revisitDate: "",
      resolved: false,
    });
    expect(normalized.notes).toHaveLength(1);
    expect(normalized.notes[0]).toMatchObject({
      category: "Shared tutor note",
    });
    expect(normalized.notes[0]?.body).toHaveLength(2_000);
  });

  it("normalizes session approval maps and infers a legacy mock milestone", () => {
    const normalized = normalizeState({
      ...createDefaultState(),
      sessionCompletionRequests: {
        "w1-session-1": {
          taskId: "w1-session-1",
          requestedAt: "2026-09-05T10:00:00.000Z",
        },
      },
      sessionCompletionReviews: {
        "w1-session-1": {
          taskId: "w1-session-1",
          requestedAt: "2026-09-05T10:00:00.000Z",
          status: "approved",
          reviewedAt: "2026-09-05T11:00:00.000Z",
          note: "Ready",
        },
      },
      mockScores: [{
        id: "legacy-mock",
        date: "2027-01-11",
        label: "Mock 1",
        score: 62,
        note: "",
      }],
    });
    expect(normalized.sessionCompletionReviews["w1-session-1"]?.status).toBe("approved");
    expect(normalized.mockScores[0]?.milestoneWeek).toBe(18);
  });

  it("deduplicates repeated record identities before merge code sees them", () => {
    const state = createDefaultState();
    state.practiceLogs = [
      {
        id: "same-id",
        date: "2026-08-20",
        topic: TOPICS[0],
        attempted: 10,
        correct: 7,
        source: "First",
        note: "",
        confidence: 3,
      },
      {
        id: "same-id",
        date: "2026-08-21",
        topic: TOPICS[0],
        attempted: 20,
        correct: 15,
        source: "Second",
        note: "",
        confidence: 3,
      },
    ];
    const normalized = normalizeState(state);
    expect(normalized.practiceLogs).toHaveLength(1);
    expect(normalized.practiceLogs[0]?.source).toBe("First");
  });

  it("rejects override maps outside the 25-checkpoint Friday/Saturday policy", () => {
    const invalidSchedules = [
      {
        "2": {
          sessionNumber: 2,
          date: "2026-09-10",
          reason: "Wrong weekday",
          updatedAt: "2026-08-13T00:00:00.000Z",
        },
      },
      {
        "2": {
          sessionNumber: 2,
          date: "2026-09-19",
          reason: "Wrong week",
          updatedAt: "2026-08-13T00:00:00.000Z",
        },
      },
      {
        "25": {
          sessionNumber: 25,
          date: "2027-02-27",
          reason: "Exam collision",
          updatedAt: "2026-08-13T00:00:00.000Z",
        },
      },
      {
        "2": {
          sessionNumber: 3,
          date: "2026-09-11",
          reason: "Mismatched identity",
          updatedAt: "2026-08-13T00:00:00.000Z",
        },
      },
      {
        "2": {
          sessionNumber: 2,
          date: "2026-02-30",
          reason: "Impossible date",
          updatedAt: "2026-08-13T00:00:00.000Z",
        },
      },
    ];

    for (const sessionOverrides of invalidSchedules) {
      expect(() =>
        normalizeState({ ...createDefaultState(), sessionOverrides }),
      ).toThrow();
    }
  });
});
