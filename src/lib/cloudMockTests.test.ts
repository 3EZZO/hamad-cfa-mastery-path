import { Timestamp } from "firebase/firestore";
import { describe, expect, it } from "vitest";
import { parseMockAttemptSnapshot } from "./cloudMockTests";
import { mockAttemptDurationMs, mockAttemptQuestionCount } from "./mockTestContent";

const base = {
  uid: "student-1",
  testVersion: "v1",
  attemptNumber: 1,
  status: "active",
  startedAt: Timestamp.fromMillis(1_000_000),
  lastSeenAt: Timestamp.fromMillis(1_000_500),
  incidents: [],
  keystrokes: [],
  submittedAt: null,
  finishReason: null,
  score: null,
  correct: null,
  reviewReleased: false,
};

describe("mock attempt snapshots", () => {
  it("reads a module-test attempt as 8 questions / 12 minutes, without paper fields", () => {
    const attempt = parseMockAttemptSnapshot("student-1_m01-rates-and-returns", {
      ...base, moduleId: "m01-rates-and-returns", answers: Array(8).fill(null), flags: Array(8).fill(false),
    });
    expect(attempt).not.toHaveProperty("questionCount");
    expect(attempt).not.toHaveProperty("dwellMs");
    expect(mockAttemptQuestionCount(attempt)).toBe(8);
    expect(mockAttemptDurationMs(attempt)).toBe(720_000);
  });

  it("reads the frozen size, duration and dwell of a paper attempt", () => {
    const attempt = parseMockAttemptSnapshot("student-1_qm-paper-01", {
      ...base, moduleId: "qm-paper-01", questionCount: 44, durationSeconds: 3960,
      answers: Array(44).fill(null), flags: Array(44).fill(false), dwellMs: Array(44).fill(0),
    });
    expect(attempt.questionCount).toBe(44);
    expect(mockAttemptDurationMs(attempt)).toBe(3_960_000);
    expect(attempt.dwellMs).toHaveLength(44);
  });

  it("fills missing answer arrays to the frozen paper size", () => {
    const attempt = parseMockAttemptSnapshot("student-1_qm-paper-01", {
      ...base, moduleId: "qm-paper-01", questionCount: 44, durationSeconds: 3960,
    });
    expect(attempt.answers).toHaveLength(44);
    expect(attempt.flags).toHaveLength(44);
  });
});
