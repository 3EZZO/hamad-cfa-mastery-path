import { describe, expect, it } from "vitest";
import {
  MOCK_DURATION_MS,
  MOCK_MAX_INCIDENTS,
  MockContentError,
  appendIncident,
  formatMockClock,
  gradeMockAnswers,
  mockAttemptId,
  mockAttemptView,
  mockRemainingMs,
  mockTimeUsedMs,
  parseMockTestDraft,
  splitMockDraft,
  type MockAttempt,
} from "./mockTestContent";

// Synthetic fixture only: real mock content is private and never committed.
function syntheticDraft(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 1,
    moduleId: "m99-synthetic",
    version: "test-1",
    title: "Synthetic mock",
    source: "Unit test fixture",
    questions: Array.from({ length: 8 }, (_, index) => ({
      id: `syn-q${index + 1}`,
      stem: `Synthetic stem ${index + 1}`,
      table: index === 0 ? { caption: "Exhibit", headers: ["Year", "Return"], rows: [["1", "5%"], ["2", "-3%"]] } : null,
      options: ["Alpha.", "Beta.", "Gamma."],
      correctOption: index % 3,
      concept: "Synthetic concept",
      explanation: "Synthetic explanation",
      working: ["step"],
      keystrokes: "",
      distractors: ["a", "b", "c"],
      confidence: "High",
      sourceFiles: [],
      sourceRef: "",
    })),
    ...overrides,
  };
}

function attempt(overrides: Partial<MockAttempt> = {}): MockAttempt {
  return {
    id: mockAttemptId("student-1", "m99-synthetic"),
    uid: "student-1",
    moduleId: "m99-synthetic",
    testVersion: "test-1",
    attemptNumber: 1,
    status: "active",
    startedAtMs: 1_000_000,
    lastSeenAtMs: 1_000_000,
    answers: Array(8).fill(null),
    flags: Array(8).fill(false),
    incidents: [],
    keystrokes: [],
    submittedAtMs: null,
    finishReason: null,
    score: null,
    correct: null,
    reviewReleased: false,
    ...overrides,
  };
}

describe("mock test content contract", () => {
  it("parses a valid upload and wraps table rows for Firestore", () => {
    const draft = parseMockTestDraft(syntheticDraft());
    expect(draft.questions).toHaveLength(8);
    expect(draft.questions[0]!.table!.rows[0]).toEqual({ cells: ["1", "5%"] });
  });

  it("rejects a test that does not have exactly eight questions", () => {
    const short = syntheticDraft({ questions: syntheticDraft().questions.slice(0, 7) });
    expect(() => parseMockTestDraft(short)).toThrow(MockContentError);
  });

  it("rejects an answer outside A-C and a table with ragged rows", () => {
    const badAnswer = syntheticDraft();
    (badAnswer.questions[2] as Record<string, unknown>).correctOption = 3;
    expect(() => parseMockTestDraft(badAnswer)).toThrow(/correctOption/);
    const rowLabels = syntheticDraft();
    rowLabels.questions[0]!.table = { caption: "", headers: ["", "2019"], rows: [["Balance", "800"]] };
    expect(parseMockTestDraft(rowLabels).questions[0]!.table!.headers).toEqual(["", "2019"]);
    const ragged = syntheticDraft();
    ragged.questions[0]!.table = { caption: "", headers: ["A", "B"], rows: [["only one"]] };
    expect(() => parseMockTestDraft(ragged)).toThrow(/cells/);
  });

  it("never copies answer or explanation fields into the student questions document", () => {
    const { questions, key, review } = splitMockDraft(parseMockTestDraft(syntheticDraft()));
    const serialized = JSON.stringify(questions);
    for (const forbidden of ["correctOption", "explanation", "distractors", "confidence", "concept", "keystrokes", "sourceFiles"]) {
      expect(serialized).not.toContain(forbidden);
    }
    expect(key.correct).toEqual([0, 1, 2, 0, 1, 2, 0, 1]);
    expect(review.items).toHaveLength(8);
  });
});

describe("grading and timing", () => {
  it("grades unanswered questions as wrong", () => {
    const result = gradeMockAnswers([0, 1, null, 0, 2, 2, null, 1], [0, 1, 2, 0, 1, 2, 0, 1]);
    expect(result.correct).toEqual([true, true, false, true, false, true, false, true]);
    expect(result.score).toBe(5);
  });

  it("uses the server offset, so a changed device clock adds no time", () => {
    const started = 1_000_000;
    // Device clock is 10 minutes behind the server: offset +600 000 ms.
    const deviceNow = started - 600_000 + 60_000;
    expect(mockRemainingMs(started, deviceNow, 600_000)).toBe(MOCK_DURATION_MS - 60_000);
    // Without the offset the same device reading would show 22 minutes left.
    expect(mockRemainingMs(started, deviceNow, 0)).toBeGreaterThan(MOCK_DURATION_MS);
    expect(mockRemainingMs(started, started + MOCK_DURATION_MS + 5_000, 0)).toBe(0);
  });

  it("derives the attempt status the student and tutor see", () => {
    expect(mockAttemptView(null, 0)).toBe("not-started");
    expect(mockAttemptView(attempt(), 1_000_000 + 60_000)).toBe("in-progress");
    expect(mockAttemptView(attempt(), 1_000_000 + MOCK_DURATION_MS)).toBe("expired");
    expect(mockAttemptView(attempt({ status: "submitted" }), 0)).toBe("completed");
    expect(mockAttemptView(attempt({ status: "forfeited" }), 0)).toBe("forfeited");
  });

  it("caps time used at 12 minutes", () => {
    expect(mockTimeUsedMs(attempt({ submittedAtMs: 1_000_000 + 400_000 }))).toBe(400_000);
    expect(mockTimeUsedMs(attempt({ submittedAtMs: 1_000_000 + MOCK_DURATION_MS + 9_000 }))).toBe(MOCK_DURATION_MS);
    expect(mockTimeUsedMs(attempt())).toBeNull();
  });

  it("formats the countdown and bounds the incident log", () => {
    expect(formatMockClock(MOCK_DURATION_MS)).toBe("12:00");
    expect(formatMockClock(299_001)).toBe("05:00");
    expect(formatMockClock(0)).toBe("00:00");
    let incidents = attempt().incidents;
    for (let index = 0; index < MOCK_MAX_INCIDENTS + 5; index += 1) {
      incidents = appendIncident(incidents, { type: "tab-hidden", atClient: "x", elapsedMs: index });
    }
    expect(incidents).toHaveLength(MOCK_MAX_INCIDENTS);
  });
});
