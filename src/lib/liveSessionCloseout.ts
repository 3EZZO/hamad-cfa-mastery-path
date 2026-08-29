import type { LiveSessionCloseoutResult, LiveSessionEvidence } from "../features/liveSession";
import type { TrackerState } from "../types";

const MASTERY_VALUE = {
  green: 90,
  amber: 65,
  red: 35,
} as const;

const ERROR_CATEGORY: Record<string, string> = {
  D: "Concept gap",
  T: "Reading error",
  P: "Formula / process",
  S: "Formula / process",
  A: "Formula / process",
  I: "Reading error",
  C: "Confidence error",
};

const ERROR_REPAIR: Record<string, string> = {
  D: "Name the measure and decision rule before choosing a formula.",
  T: "Draw the timeline and place every external cash flow before calculating.",
  P: "Make the rate, period count, and payment frequency use the same period.",
  S: "State the cash-flow direction or quotation convention before calculating.",
  A: "Estimate direction and magnitude, then rebuild the arithmetic one line at a time.",
  I: "Finish with the asset, period, units, and economic meaning of the result.",
  C: "Require a fresh no-cue proof before accepting the confidence rating.",
};

export interface ApplyLiveSessionCloseoutOptions {
  tracker: TrackerState;
  result: LiveSessionCloseoutResult;
  sessionNumber: number;
  week: number;
  date: string;
  title: string;
  taskId: string;
}

export interface RemoveLiveSessionCloseoutOptions {
  tracker: TrackerState;
  result: LiveSessionCloseoutResult;
  taskId: string;
}

function uniqueLatestEvidence(evidence: LiveSessionEvidence[]): LiveSessionEvidence[] {
  const latest = new Map<string, LiveSessionEvidence>();
  evidence.forEach((entry) => latest.set(entry.targetId, entry));
  return [...latest.values()];
}

function safeId(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]+/g, "-").slice(0, 80);
}

function addDays(dateOnly: string, days: number): string {
  const date = new Date(`${dateOnly}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function upsertById<T extends { id: string }>(items: T[], item: T): T[] {
  return [item, ...items.filter((candidate) => candidate.id !== item.id)];
}

function masteryScore(result: LiveSessionCloseoutResult): number {
  if (!result.mastery.length) return 0;
  const total = result.mastery.reduce(
    (sum, item) => sum + MASTERY_VALUE[item.decision],
    0,
  );
  return Math.round(total / result.mastery.length);
}

/**
 * Converts the tutor's live closeout into the ordinary shared tracker records.
 * The operation is idempotent so retrying after an interrupted sync cannot
 * duplicate a session, practice block, or mistake.
 */
export function applyLiveSessionCloseout({
  tracker,
  result,
  sessionNumber,
  week,
  date,
  title,
  taskId,
}: ApplyLiveSessionCloseoutOptions): TrackerState {
  const latestEvidence = uniqueLatestEvidence(result.evidence);
  const answered = latestEvidence.filter((entry) => entry.verdict !== "parked");
  const correct = answered.filter((entry) => entry.verdict === "correct").length;
  const averageConfidence = answered.length
    ? Math.round(
        answered.reduce((sum, entry) => sum + entry.confidence, 0) /
          answered.length,
      )
    : 3;
  const baseId = safeId(result.sessionId);
  const completedAt = result.completedAt;
  const mastery = masteryScore(result);
  const priorRequest = tracker.sessionCompletionRequests[taskId];

  const sessionLog = {
    id: `${baseId}-session-log`,
    date,
    sessionNumber,
    week,
    type: "Tutor-led mastery session",
    durationMinutes: result.actualMinutes,
    focus: title,
    outcome: result.outcome,
    nextAction: result.nextAction,
  };

  const nextPracticeLogs = answered.length
    ? upsertById(tracker.practiceLogs, {
        id: `${baseId}-live-evidence`,
        date,
        topic: "Quantitative Methods",
        attempted: answered.length,
        correct,
        source: `Session ${String(sessionNumber).padStart(2, "0")} live evidence`,
        note: `${result.homework} Delayed retest: ${result.delayedRetest}`.trim(),
        confidence: Math.min(5, Math.max(1, averageConfidence)),
      })
    : tracker.practiceLogs;

  const repaired = latestEvidence.filter(
    (entry) => entry.verdict === "repair" || entry.verdict === "parked",
  );
  const nextErrors = repaired.reduce((items, entry) => {
    const primaryCode = entry.errorCodes[0] ?? "D";
    const correction = entry.errorCodes
      .map((code) => ERROR_REPAIR[code])
      .filter(Boolean)
      .join(" ");
    return upsertById(items, {
      id: `${baseId}-error-${safeId(entry.targetId)}`,
      date,
      topic: "Quantitative Methods",
      category: ERROR_CATEGORY[primaryCode] ?? "Concept gap",
      summary: `${entry.targetLabel}${entry.note ? ` — ${entry.note}` : ""}`,
      correction: correction || ERROR_REPAIR.D,
      revisitDate: addDays(date, 7),
      resolved: false,
    });
  }, tracker.errorEntries);

  const sessionCompletionRequests = { ...tracker.sessionCompletionRequests };
  delete sessionCompletionRequests[taskId];

  return {
    ...tracker,
    taskCompletions: {
      ...tracker.taskCompletions,
      [taskId]: true,
    },
    sessionCompletionRequests,
    sessionCompletionReviews: {
      ...tracker.sessionCompletionReviews,
      [taskId]: {
        taskId,
        requestedAt: priorRequest?.requestedAt ?? completedAt,
        status: "approved",
        reviewedAt: completedAt,
        note: "Approved through tutor-led Session Mode closeout.",
      },
    },
    topicMastery: mastery
      ? { ...tracker.topicMastery, "Quantitative Methods": mastery }
      : tracker.topicMastery,
    sessionLogs: upsertById(tracker.sessionLogs, sessionLog),
    practiceLogs: nextPracticeLogs,
    errorEntries: nextErrors,
  };
}

/**
 * Removes only the deterministic shared records created by one pre-session
 * rehearsal closeout. This is intentionally separate from the ordinary live
 * run delete: clearing a Firestore run alone would leave false progress in the
 * student tracker. Unrelated sessions, practice, errors, and mastery changes
 * are preserved.
 */
export function removeLiveSessionCloseoutArtifacts({
  tracker,
  result,
  taskId,
}: RemoveLiveSessionCloseoutOptions): TrackerState {
  const baseId = safeId(result.sessionId);
  const sessionLogId = `${baseId}-session-log`;
  const practiceLogId = `${baseId}-live-evidence`;
  const errorIdPrefix = `${baseId}-error-`;
  const derivedMastery = masteryScore(result);
  const taskCompletions = { ...tracker.taskCompletions };
  const sessionCompletionRequests = {
    ...tracker.sessionCompletionRequests,
  };
  const sessionCompletionReviews = { ...tracker.sessionCompletionReviews };
  const topicMastery = { ...tracker.topicMastery };

  delete taskCompletions[taskId];
  delete sessionCompletionRequests[taskId];
  delete sessionCompletionReviews[taskId];
  // Do not erase a mastery value that Mohamed changed after the rehearsal.
  if (
    derivedMastery > 0 &&
    topicMastery["Quantitative Methods"] === derivedMastery
  ) {
    delete topicMastery["Quantitative Methods"];
  }

  return {
    ...tracker,
    taskCompletions,
    sessionCompletionRequests,
    sessionCompletionReviews,
    topicMastery,
    sessionLogs: tracker.sessionLogs.filter(item => item.id !== sessionLogId),
    practiceLogs: tracker.practiceLogs.filter(
      item => item.id !== practiceLogId
    ),
    errorEntries: tracker.errorEntries.filter(
      item => !item.id.startsWith(errorIdPrefix)
    ),
  };
}

export function buildLiveSessionPrivateNote(
  result: LiveSessionCloseoutResult,
  date: string,
): {
  id: string;
  date: string;
  category: string;
  title: string;
  body: string;
  updatedAt: string;
} | null {
  const body = result.privateTutorNote.trim();
  if (!body) return null;
  return {
    id: `${safeId(result.sessionId)}-private-note`,
    date,
    category: "Shared tutor note",
    title: "Session 01 private closeout",
    body,
    updatedAt: result.completedAt,
  };
}
