import { deadlinePassed } from "./mockReminders";
import { mockAttemptView, type MockAttempt } from "./mockTestContent";

/**
 * The Tests destination's priority board: every module test in the order it
 * needs attention — resume what is running, then what the tutor has put a
 * deadline on (soonest first), then what is available, then what is
 * waiting to be graded, then the finished ones, then what is not published.
 */

export type BoardStatus = "in-progress" | "due" | "available" | "grading" | "done" | "forfeited" | "unpublished";

export interface BoardEntry {
  moduleId: string;
  number: number;
  published: boolean;
  attempt: MockAttempt | null;
  /** Tutor reminder deadline (local `YYYY-MM-DD`), when one is set. */
  deadline: string | null;
}

export interface BoardRow extends BoardEntry {
  status: BoardStatus;
  score: number | null;
  /** Deadline passed and the test is still not submitted. */
  overdue: boolean;
  /** Finished below WEAK_SCORE: worth a repair pass. */
  weak: boolean;
}

export interface BoardSummary {
  published: number;
  done: number;
  inProgress: number;
  overdue: number;
  /** Earliest deadline among tests still to take. */
  nextDeadline: string | null;
}

/** Below 6 of 8 (75%) a module test result asks for repair. */
export const WEAK_SCORE = 6;

const RANK: Record<BoardStatus, number> = {
  "in-progress": 0,
  due: 1,
  available: 2,
  grading: 3,
  done: 4,
  forfeited: 4,
  unpublished: 5,
};

export function boardStatus(entry: BoardEntry, nowMs: number): BoardStatus {
  if (!entry.published) return "unpublished";
  const view = mockAttemptView(entry.attempt, nowMs);
  if (view === "in-progress" || view === "expired") return "in-progress";
  if (view === "forfeited") return "forfeited";
  if (view === "completed") return entry.attempt?.score == null ? "grading" : "done";
  return entry.deadline ? "due" : "available";
}

export function buildTestBoard(entries: BoardEntry[], nowMs: number): BoardRow[] {
  return entries
    .map((entry): BoardRow => {
      const status = boardStatus(entry, nowMs);
      const score = entry.attempt?.score ?? null;
      return {
        ...entry,
        status,
        score,
        overdue: (status === "due" || status === "in-progress") && deadlinePassed(entry.deadline, nowMs),
        weak: status === "done" && score !== null && score < WEAK_SCORE,
      };
    })
    .sort((left, right) =>
      RANK[left.status] - RANK[right.status]
      || (left.status === "due" && right.status === "due" ? (left.deadline ?? "").localeCompare(right.deadline ?? "") : 0)
      || left.number - right.number);
}

export function summarizeTestBoard(rows: BoardRow[]): BoardSummary {
  const toTake = rows.filter((row) => row.status === "due" || row.status === "available" || row.status === "in-progress");
  return {
    published: rows.filter((row) => row.status !== "unpublished").length,
    done: rows.filter((row) => row.status === "done" || row.status === "grading" || row.status === "forfeited").length,
    inProgress: rows.filter((row) => row.status === "in-progress").length,
    overdue: rows.filter((row) => row.overdue).length,
    nextDeadline: toTake.map((row) => row.deadline).filter((value): value is string => Boolean(value)).sort()[0] ?? null,
  };
}

/** Earliest active deadline per module from a list of reminders for one student. */
export function deadlinesByModule(
  reminders: Array<{ studentUid: string; status: string; deadline: string | null; moduleIds: string[] }>,
  studentUid: string | null,
): Map<string, string> {
  const deadlines = new Map<string, string>();
  for (const reminder of reminders) {
    if (reminder.status !== "active" || !reminder.deadline) continue;
    if (studentUid && reminder.studentUid !== studentUid) continue;
    for (const moduleId of reminder.moduleIds) {
      const current = deadlines.get(moduleId);
      if (!current || reminder.deadline < current) deadlines.set(moduleId, reminder.deadline);
    }
  }
  return deadlines;
}
