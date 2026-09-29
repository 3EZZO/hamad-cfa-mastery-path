import { describe, expect, it } from "vitest";
import type { MockAttempt } from "./mockTestContent";
import { MOCK_DURATION_MS } from "./mockTestContent";
import { boardStatus, buildTestBoard, deadlinesByModule, summarizeTestBoard, type BoardEntry } from "./testBoard";

const NOW = new Date(2026, 9, 1, 12, 0, 0).getTime(); // 1 Oct 2026, local noon

function attempt(overrides: Partial<MockAttempt>): MockAttempt {
  return {
    id: "a", uid: "s", moduleId: "m", testVersion: "1", attemptNumber: 1, status: "submitted",
    startedAtMs: NOW - 60 * 60_000, lastSeenAtMs: NOW, answers: [], flags: [], incidents: [], keystrokes: [],
    submittedAtMs: NOW - 50 * 60_000, finishReason: "submitted", score: 7, correct: null, reviewReleased: false,
    ...overrides,
  } as MockAttempt;
}

function entry(number: number, overrides: Partial<BoardEntry> = {}): BoardEntry {
  return { moduleId: `m${number}`, number, published: true, attempt: null, deadline: null, ...overrides };
}

describe("boardStatus", () => {
  it("classifies every state", () => {
    expect(boardStatus(entry(1, { published: false }), NOW)).toBe("unpublished");
    expect(boardStatus(entry(1), NOW)).toBe("available");
    expect(boardStatus(entry(1, { deadline: "2026-10-03" }), NOW)).toBe("due");
    expect(boardStatus(entry(1, { attempt: attempt({ status: "active", startedAtMs: NOW - 60_000, submittedAtMs: null, score: null }) }), NOW)).toBe("in-progress");
    // An active attempt past its clock still needs finalizing: treat it as in progress.
    expect(boardStatus(entry(1, { attempt: attempt({ status: "active", startedAtMs: NOW - MOCK_DURATION_MS - 60_000, submittedAtMs: null, score: null }) }), NOW)).toBe("in-progress");
    expect(boardStatus(entry(1, { attempt: attempt({ score: null }) }), NOW)).toBe("grading");
    expect(boardStatus(entry(1, { attempt: attempt({}) }), NOW)).toBe("done");
    expect(boardStatus(entry(1, { attempt: attempt({ status: "forfeited", score: 0 }) }), NOW)).toBe("forfeited");
  });
});

describe("buildTestBoard", () => {
  const board = buildTestBoard([
    entry(1, { attempt: attempt({ score: 5 }) }),
    entry(2, { published: false }),
    entry(3),
    entry(4, { deadline: "2026-10-05" }),
    entry(5, { deadline: "2026-09-30" }),
    entry(6, { attempt: attempt({ status: "active", startedAtMs: NOW - 60_000, submittedAtMs: null, score: null }) }),
    entry(7, { attempt: attempt({ score: null }) }),
    entry(8, { attempt: attempt({ score: 8 }) }),
  ], NOW);

  it("orders by what needs attention first", () => {
    expect(board.map((row) => row.number)).toEqual([6, 5, 4, 3, 7, 1, 8, 2]);
  });

  it("flags overdue deadlines and weak results", () => {
    expect(board.find((row) => row.number === 5)?.overdue).toBe(true);
    expect(board.find((row) => row.number === 4)?.overdue).toBe(false);
    expect(board.find((row) => row.number === 1)?.weak).toBe(true);
    expect(board.find((row) => row.number === 8)?.weak).toBe(false);
  });

  it("summarizes progress and the next deadline", () => {
    expect(summarizeTestBoard(board)).toEqual({ published: 7, done: 3, inProgress: 1, overdue: 1, nextDeadline: "2026-09-30", dueNext: 1, doneNext: 0 });
  });

  it("counts progress against the tests due by the next deadline, finished ones included", () => {
    const shared = buildTestBoard([
      entry(1, { deadline: "2026-10-01", attempt: attempt({ score: 7 }) }),
      entry(2, { deadline: "2026-10-01" }),
      entry(3, { deadline: "2026-10-01" }),
      entry(4, { deadline: "2026-10-08" }),
      entry(5),
      entry(6, { published: false, deadline: "2026-10-01" }),
    ], NOW);
    expect(summarizeTestBoard(shared)).toMatchObject({ published: 5, nextDeadline: "2026-10-01", dueNext: 3, doneNext: 1 });
  });
});

describe("deadlinesByModule", () => {
  it("keeps the earliest active deadline per module for the student", () => {
    const deadlines = deadlinesByModule([
      { studentUid: "s", status: "active", deadline: "2026-10-09", moduleIds: ["m1", "m2"] },
      { studentUid: "s", status: "active", deadline: "2026-10-04", moduleIds: ["m2"] },
      { studentUid: "s", status: "cancelled", deadline: "2026-10-01", moduleIds: ["m1"] },
      { studentUid: "other", status: "active", deadline: "2026-10-02", moduleIds: ["m1"] },
      { studentUid: "s", status: "active", deadline: null, moduleIds: ["m3"] },
    ], "s");
    expect([...deadlines.entries()]).toEqual([["m1", "2026-10-09"], ["m2", "2026-10-04"]]);
  });
});
