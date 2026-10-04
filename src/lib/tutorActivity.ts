import { mockModuleById, mockModuleCode } from "../data/mockModules";
import type { MockReminder } from "./mockReminders";
import type { MockAttempt, MockAttemptHistoryEntry } from "./mockTestContent";
import type { PracticeRun } from "./practiceContent";

/**
 * A dated feed of what happened, newest first, for Tutor Admin's Activity
 * tab: module tests, practice sets, session requests and reviews, reminders,
 * mistakes and payments. Pure; built from data the tutor can already read.
 */

export type ActivityKind = "test" | "practice" | "session" | "reminder" | "mistake" | "payment";

export interface ActivityEvent {
  id: string;
  kind: ActivityKind;
  atMs: number;
  title: string;
  detail: string;
  /** Recorded as a day only (no meaningful time of day). */
  dateOnly?: boolean;
}

export interface ActivityInput {
  attempts: readonly MockAttempt[];
  history: readonly MockAttemptHistoryEntry[];
  runs: readonly PracticeRun[];
  sessionRequests: ReadonlyArray<{ taskId: string; label: string; requestedAt: string }>;
  sessionReviews: ReadonlyArray<{ taskId: string; label: string; reviewedAt: string; status: "approved" | "returned"; note: string }>;
  reminders: readonly MockReminder[];
  mistakes: ReadonlyArray<{ id: string; date: string; topic: string; questionId?: string }>;
  payments: ReadonlyArray<{ id: string; dateRecorded: string; amount: number; status: string }>;
  currency: string | null;
}

const MODE_LABEL: Record<PracticeRun["mode"], string> = {
  quick: "Quick set",
  module: "Module set",
  exam: "Exam drill",
  repair: "Repair queue",
  mixed: "Mixed set",
};

function test(moduleId: string): string {
  const module = mockModuleById(moduleId);
  return module ? `${mockModuleCode(module)} ${module.title}` : moduleId;
}

/** Local noon of a `YYYY-MM-DD` day, so date-only records sort within their day. */
function dayMs(day: string): number {
  const [year, month, date] = day.split("-").map(Number);
  return new Date(year!, (month ?? 1) - 1, date ?? 1, 12).getTime();
}

const time = (iso: string | null | undefined): number | null => {
  if (!iso) return null;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : null;
};

export function buildActivity(input: ActivityInput): ActivityEvent[] {
  const events: ActivityEvent[] = [];
  for (const attempt of input.attempts) {
    events.push({ id: `start-${attempt.id}`, kind: "test", atMs: attempt.startedAtMs, title: `Started ${test(attempt.moduleId)}`, detail: "Module test" });
    if (attempt.submittedAtMs !== null) {
      const forfeited = attempt.status === "forfeited";
      events.push({
        id: `finish-${attempt.id}`, kind: "test", atMs: attempt.submittedAtMs,
        title: `${forfeited ? "Forfeited" : "Submitted"} ${test(attempt.moduleId)}`,
        detail: [
          attempt.score === null ? "Awaiting grading" : `${attempt.score}/8`,
          attempt.incidents.length ? `${attempt.incidents.length} focus incidents` : "",
          attempt.reviewReleased ? "Review released" : "",
        ].filter(Boolean).join(" · "),
      });
    }
  }
  for (const entry of input.history) {
    events.push({
      id: `reset-${entry.id}-${entry.attemptNumber}`, kind: "test", atMs: entry.archivedAtMs,
      title: `Attempt reset: ${test(entry.moduleId)}`, detail: `Attempt ${entry.attemptNumber}${entry.score === null ? "" : ` scored ${entry.score}/8`}`,
    });
  }
  for (const run of input.runs) {
    const answered = run.answers.length;
    const correct = run.answers.filter((answer) => answer.correct).length;
    const finished = time(run.completedAtClient);
    const started = time(run.startedAtClient);
    const at = finished ?? time(run.updatedAtClient) ?? started;
    if (at === null) continue;
    events.push({
      id: `run-${run.id}`, kind: "practice", atMs: at,
      title: `${MODE_LABEL[run.mode]} ${finished !== null ? "completed" : "in progress"}`,
      detail: answered ? `${answered} answered · ${Math.round((correct / answered) * 100)}% correct` : "No answers yet",
    });
  }
  for (const request of input.sessionRequests) {
    const at = time(request.requestedAt);
    if (at !== null) events.push({ id: `request-${request.taskId}`, kind: "session", atMs: at, title: `Asked to complete ${request.label}`, detail: "Session completion request" });
  }
  for (const review of input.sessionReviews) {
    const at = time(review.reviewedAt);
    if (at !== null) {
      events.push({
        id: `review-${review.taskId}`, kind: "session", atMs: at,
        title: `${review.status === "approved" ? "Approved" : "Returned"} ${review.label}`, detail: review.note || "Session review",
      });
    }
  }
  for (const reminder of input.reminders) {
    const modules = reminder.moduleIds.map((id) => { const module = mockModuleById(id); return module ? mockModuleCode(module) : id; }).join(", ");
    const due = reminder.deadline ? ` · due ${reminder.deadline}` : "";
    events.push({ id: `sent-${reminder.id}`, kind: "reminder", atMs: reminder.createdAtMs, title: "Reminder sent", detail: `${modules}${due}` });
    if (reminder.seenAtMs !== null) events.push({ id: `seen-${reminder.id}`, kind: "reminder", atMs: reminder.seenAtMs, title: "Reminder opened by Hamad", detail: modules });
    if (reminder.acknowledgedAtMs !== null) events.push({ id: `ack-${reminder.id}`, kind: "reminder", atMs: reminder.acknowledgedAtMs, title: "Reminder acknowledged", detail: modules });
    if (reminder.cancelledAtMs !== null) events.push({ id: `cancel-${reminder.id}`, kind: "reminder", atMs: reminder.cancelledAtMs, title: "Reminder cancelled", detail: modules });
  }
  for (const mistake of input.mistakes) {
    events.push({ id: `mistake-${mistake.id}`, kind: "mistake", atMs: dayMs(mistake.date), title: "Mistake logged", detail: mistake.topic, dateOnly: true });
  }
  for (const payment of input.payments) {
    events.push({
      id: `payment-${payment.id}`, kind: "payment", atMs: dayMs(payment.dateRecorded),
      title: `Payment ${payment.status}`, detail: `${input.currency ?? ""} ${payment.amount.toLocaleString()}`.trim(), dateOnly: true,
    });
  }
  return events.sort((left, right) => right.atMs - left.atMs || left.id.localeCompare(right.id));
}

export type ActivityRange = "7" | "30" | "all";

export function filterActivity(
  events: readonly ActivityEvent[],
  kinds: ReadonlySet<ActivityKind>,
  range: ActivityRange,
  nowMs: number,
): ActivityEvent[] {
  const since = range === "all" ? -Infinity : nowMs - Number(range) * 24 * 60 * 60 * 1000;
  return events.filter((event) => kinds.has(event.kind) && event.atMs >= since);
}

/** Group label for a day ("Today", "Yesterday", or a short date). */
export function activityDayLabel(atMs: number, nowMs: number): string {
  const day = (ms: number) => { const date = new Date(ms); return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime(); };
  const diff = Math.round((day(nowMs) - day(atMs)) / (24 * 60 * 60 * 1000));
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  return new Date(atMs).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
}
