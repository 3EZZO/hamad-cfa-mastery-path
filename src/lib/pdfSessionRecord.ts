import type { TrackerState } from "../types";

export const PDF_SESSION_LOG_TYPE = "Tutor-led PDF session";

export function pdfSessionLogId(sessionNumber: number): string {
  return `session-${String(sessionNumber).padStart(2, "0")}-pdf-session-log`;
}

export interface ApplyPdfSessionRecordOptions {
  tracker: TrackerState;
  sessionNumber: number;
  week: number;
  date: string;
  title: string;
  taskId: string;
  durationMinutes: number;
  outcome: string;
  nextAction: string;
  /** Approve the session's task, as a guided closeout does. */
  completeTask: boolean;
  recordedAt: string;
}

/**
 * The tutor-confirmed record of a Teach from PDF session: one session log
 * (re-recording replaces it) and, when chosen, the task approval. It never
 * changes topic mastery, practice logs or the error log.
 */
export function applyPdfSessionRecord({
  tracker, sessionNumber, week, date, title, taskId, durationMinutes, outcome, nextAction, completeTask, recordedAt,
}: ApplyPdfSessionRecordOptions): TrackerState {
  const id = pdfSessionLogId(sessionNumber);
  const sessionLog = {
    id,
    date,
    sessionNumber,
    week,
    type: PDF_SESSION_LOG_TYPE,
    durationMinutes: Math.max(0, Math.round(durationMinutes)),
    focus: title,
    outcome: outcome.trim(),
    nextAction: nextAction.trim(),
  };
  const next: TrackerState = {
    ...tracker,
    sessionLogs: [sessionLog, ...tracker.sessionLogs.filter(item => item.id !== id)],
  };
  if (!completeTask) return next;
  const sessionCompletionRequests = { ...tracker.sessionCompletionRequests };
  const priorRequest = sessionCompletionRequests[taskId];
  delete sessionCompletionRequests[taskId];
  return {
    ...next,
    taskCompletions: { ...tracker.taskCompletions, [taskId]: true },
    sessionCompletionRequests,
    sessionCompletionReviews: {
      ...tracker.sessionCompletionReviews,
      [taskId]: {
        taskId,
        requestedAt: priorRequest?.requestedAt ?? recordedAt,
        status: "approved",
        reviewedAt: recordedAt,
        note: "Approved through the Teach from PDF session summary.",
      },
    },
  };
}
