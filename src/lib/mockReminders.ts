/**
 * Tutor reminders about the module mock tests: pure rules for when the
 * student's reminder window appears, re-appears and stops. The Firestore
 * document is written by the tutor; the student may only stamp `seenAt` and
 * `acknowledgedAt` (see firestore.rules, mockReminders).
 */

export const DEFAULT_REMINDER_MESSAGE =
  "Please complete your module mock tests as soon as possible, and no later than Thursday, 1 October.";
export const REMINDER_MESSAGE_MAX = 1000;
export const REMINDER_URGENT_MS = 24 * 60 * 60 * 1000;

export type MockReminderStatus = "active" | "cancelled";

export interface MockReminder {
  id: string;
  studentUid: string;
  message: string;
  /** Local calendar date `YYYY-MM-DD`; the deadline is the end of that day. */
  deadline: string | null;
  moduleIds: string[];
  status: MockReminderStatus;
  createdAtMs: number;
  createdBy: string;
  editedAtMs: number | null;
  cancelledAtMs: number | null;
  seenAtMs: number | null;
  acknowledgedAtMs: number | null;
}

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isReminderDate(value: string): boolean {
  const match = DATE_PATTERN.exec(value);
  if (!match) return false;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}

/** Local `YYYY-MM-DD` for a moment on this device. */
export function localDay(ms: number): string {
  const date = new Date(ms);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** The last millisecond of the deadline day, local time. */
export function deadlineEndMs(deadline: string): number {
  const match = DATE_PATTERN.exec(deadline);
  if (!match) return Number.NaN;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]) + 1).getTime() - 1;
}

export function deadlinePassed(deadline: string | null, nowMs: number): boolean {
  return deadline !== null && nowMs > deadlineEndMs(deadline);
}

/** Within the final 24 hours before the deadline (and not yet past it). */
export function deadlineUrgent(deadline: string | null, nowMs: number): boolean {
  if (deadline === null) return false;
  const left = deadlineEndMs(deadline) - nowMs;
  return left >= 0 && left <= REMINDER_URGENT_MS;
}

/** "Due today", "1 day left", "4 days left"; counted in calendar days. */
export function deadlineCountdown(deadline: string, nowMs: number): string {
  if (deadlinePassed(deadline, nowMs)) return "Deadline passed";
  const today = new Date(nowMs);
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const startOfDeadline = deadlineEndMs(deadline) + 1 - 24 * 60 * 60 * 1000;
  const days = Math.round((startOfDeadline - startOfToday) / (24 * 60 * 60 * 1000));
  if (days <= 0) return "Due today";
  return days === 1 ? "1 day left" : `${days} days left`;
}

export function formatReminderDate(deadline: string): string {
  const match = DATE_PATTERN.exec(deadline);
  if (!match) return deadline;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])).toLocaleDateString(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/**
 * Whether the reminder window should open now.
 *
 * - Cancelled reminders, and reminders whose listed modules are all done,
 *   never show.
 * - A reminder with a deadline stops once the deadline day has passed.
 * - Until the student presses "Got it" it always shows.
 * - After that, a reminder with a deadline shows again once per calendar
 *   day while modules are still pending; one without a deadline does not.
 */
export function shouldShowReminder(
  reminder: MockReminder,
  pendingModuleIds: readonly string[],
  nowMs: number,
): boolean {
  if (reminder.status !== "active") return false;
  if (!reminder.moduleIds.some(id => pendingModuleIds.includes(id))) return false;
  if (deadlinePassed(reminder.deadline, nowMs)) return false;
  if (reminder.acknowledgedAtMs === null) return true;
  if (reminder.deadline === null) return false;
  return localDay(reminder.acknowledgedAtMs) < localDay(nowMs);
}

/** The reminder to show: the newest one that qualifies. */
export function pickReminderToShow(
  reminders: readonly MockReminder[],
  pendingModuleIds: readonly string[],
  nowMs: number,
): MockReminder | null {
  return [...reminders]
    .filter(reminder => shouldShowReminder(reminder, pendingModuleIds, nowMs))
    .sort((a, b) => b.createdAtMs - a.createdAtMs)[0] ?? null;
}

export type ReminderProgress = "sent" | "seen" | "acknowledged" | "completed" | "expired" | "cancelled";

/** What the tutor's history shows for one reminder. */
export function reminderProgress(
  reminder: MockReminder,
  completedModuleIds: readonly string[],
  nowMs: number,
): ReminderProgress {
  if (reminder.status === "cancelled") return "cancelled";
  if (reminder.moduleIds.every(id => completedModuleIds.includes(id))) return "completed";
  if (deadlinePassed(reminder.deadline, nowMs)) return "expired";
  if (reminder.acknowledgedAtMs !== null) return "acknowledged";
  if (reminder.seenAtMs !== null) return "seen";
  return "sent";
}

export interface ReminderDraft {
  studentUid: string;
  message: string;
  deadline: string | null;
  moduleIds: string[];
}

/** Returns an error message, or null when the draft can be sent. */
export function validateReminderDraft(draft: ReminderDraft): string | null {
  const message = draft.message.trim();
  if (!draft.studentUid) return "Choose the student.";
  if (!message) return "Write a message.";
  if (message.length > REMINDER_MESSAGE_MAX) return `Keep the message under ${REMINDER_MESSAGE_MAX} characters.`;
  if (draft.moduleIds.length === 0) return "Choose at least one module.";
  if (draft.deadline !== null && !isReminderDate(draft.deadline)) return "Choose a valid deadline date.";
  return null;
}
