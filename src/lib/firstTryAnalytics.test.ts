import { describe, expect, it } from "vitest";
import type { MockAttempt, MockAttemptHistoryEntry } from "./mockTestContent";
import { topicScoreTrends } from "./mockTrends";
import { scoreText } from "./sessionPrep";
import { buildActivity, type ActivityInput } from "./tutorActivity";
import { buildTutorInbox, type InboxInput } from "./tutorInbox";
import { moduleStandings } from "./tutorInsights";

/**
 * Learn, then final: a final attempt follows a full review of the answers, so
 * the tutor's analytics read the first try. Hamad still sees his final score.
 */
const NOW = new Date(2026, 9, 10, 12, 0, 0).getTime();
const DAY = 24 * 60 * 60 * 1000;

function attempt(moduleId: string, overrides: Partial<MockAttempt> = {}): MockAttempt {
  return {
    id: `s_${moduleId}`, uid: "s", moduleId, testVersion: "1", attemptNumber: 1, status: "submitted",
    startedAtMs: NOW - 2 * DAY, lastSeenAtMs: NOW, answers: [], flags: [], incidents: [], keystrokes: [],
    submittedAtMs: NOW - 2 * DAY, finishReason: "submit", score: 7, correct: null, reviewReleased: false, ...overrides,
  } as MockAttempt;
}

// 3/8 first try, then 8/8 on the final attempt after reading the answers.
const final = attempt("e03-fiscal-policy", { attemptNumber: 2, score: 8, firstTryScore: 3 });

describe("first-try analytics", () => {
  it("flags a weak first try in the inbox even when the final is perfect", () => {
    const input: InboxInput = {
      nowMs: NOW, approvals: [], metas: [], attempts: [final], reminders: [], studentUid: "s", banks: [], assignedBankIds: [],
      practiceAnswers: [], weekCatalogIds: [], payment: null,
    };
    const weak = buildTutorInbox(input).find((item) => item.kind === "weak");
    expect(weak?.title).toBe("EC3 Fiscal Policy: 3/8 first try, no practice since");
  });

  it("ranks module strength on the first try", () => {
    const standing = moduleStandings([final], []).find((entry) => entry.test?.id === "e03-fiscal-policy");
    expect(standing?.test?.score).toBe(3);
    expect(standing?.weak).toBe(true);
  });

  it("trends each topic on first tries", () => {
    const [economics] = topicScoreTrends([final, attempt("e01-firm-and-market-structures", { score: 7 })]);
    expect(economics?.recent.map((entry) => entry.score).sort()).toEqual([3, 7]);
    expect(economics?.averageScore).toBe(5);
  });

  it("names the final attempt and the first try it followed in the activity feed", () => {
    const empty: ActivityInput = {
      attempts: [], history: [], runs: [], sessionRequests: [], sessionReviews: [], reminders: [], mistakes: [], payments: [], currency: "SAR",
    };
    const events = buildActivity({
      ...empty,
      attempts: [{ ...final, submittedAtMs: NOW - DAY }],
      history: [
        { ...attempt("e03-fiscal-policy", { score: 3 }), archivedAtMs: NOW - 1.5 * DAY, archivedBy: "s", archiveReason: "retake" } as MockAttemptHistoryEntry,
        { ...attempt("m01-rates-and-returns", { score: 2 }), archivedAtMs: NOW - 3 * DAY, archivedBy: "t" } as MockAttemptHistoryEntry,
      ],
    });
    const byTitle = new Map(events.map((event) => [event.title, event.detail]));
    expect(byTitle.get("Submitted EC3 Fiscal Policy")).toBe("8/8 · final attempt (first try 3/8)");
    expect(byTitle.get("Final attempt started: EC3 Fiscal Policy")).toBe("First try 3/8, reviewed before the final");
    expect(byTitle.get("Attempt reset: QM1 Rates and Returns")).toBe("Attempt 1 scored 2/8");
  });

  it("writes session prep as the first try, then the final", () => {
    expect(scoreText({ score: 3, final: 8 })).toBe("3/8 → final 8/8");
    expect(scoreText({ score: 6, final: null })).toBe("6/8");
    expect(scoreText({ score: null, final: null })).toBe("ungraded");
  });
});
