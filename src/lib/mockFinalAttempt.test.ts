import { Timestamp } from "firebase/firestore";
import { describe, expect, it } from "vitest";
import { parseMockAttemptSnapshot } from "./cloudMockTests";
import { canStartFinalMockAttempt, isFinalMockAttempt, mockFirstTryScore, type MockAttempt } from "./mockTestContent";

type Attempt = Pick<MockAttempt, "status" | "score" | "questionCount" | "firstTryScore">;
const first: Attempt = { status: "submitted", score: 5 };

describe("module tests: learn, then final", () => {
  it("offers the final attempt after a graded, locked first attempt", () => {
    expect(canStartFinalMockAttempt(first)).toBe(true);
    // A forfeited first attempt (Leave Test) is locked too.
    expect(canStartFinalMockAttempt({ ...first, status: "forfeited", score: 0 })).toBe(true);
  });

  it("never offers it while running, before grading, on a paper or after the final", () => {
    expect(canStartFinalMockAttempt(null)).toBe(false);
    expect(canStartFinalMockAttempt({ ...first, status: "active" })).toBe(false);
    expect(canStartFinalMockAttempt({ ...first, score: null })).toBe(false);
    expect(canStartFinalMockAttempt({ ...first, questionCount: 45 })).toBe(false);
    expect(canStartFinalMockAttempt({ ...first, firstTryScore: 4 })).toBe(false);
  });

  it("reads the first-try score for analytics: the archived one on a final attempt", () => {
    expect(isFinalMockAttempt({})).toBe(false);
    expect(isFinalMockAttempt({ firstTryScore: 0 })).toBe(true);
    expect(mockFirstTryScore({ score: 8, firstTryScore: 5 })).toBe(5);
    expect(mockFirstTryScore({ score: 6 })).toBe(6);
    expect(mockFirstTryScore({ score: null })).toBeNull();
    // A final attempt still being taken already carries its first try.
    expect(mockFirstTryScore({ score: null, firstTryScore: 3 })).toBe(3);
  });

  it("parses the first-try score from a stored final attempt, and only when present", () => {
    const stored = {
      uid: "student-1", moduleId: "m01-rates-and-returns", testVersion: "v1", attemptNumber: 2, status: "submitted",
      startedAt: Timestamp.fromMillis(1_000_000), lastSeenAt: Timestamp.fromMillis(1_000_500),
      answers: Array(8).fill(0), flags: Array(8).fill(false), incidents: [], keystrokes: [],
      submittedAt: Timestamp.fromMillis(1_300_000), finishReason: "submit", score: 7, correct: Array(8).fill(true), reviewReleased: false,
    };
    expect(parseMockAttemptSnapshot("student-1_m01-rates-and-returns", { ...stored, firstTryScore: 5 }).firstTryScore).toBe(5);
    expect("firstTryScore" in parseMockAttemptSnapshot("student-1_m01-rates-and-returns", stored)).toBe(false);
  });
});
