import { mockModuleById, mockModuleCode } from "../data/mockModules";
import { deadlinePassed, type MockReminder } from "./mockReminders";
import type { MockAttempt } from "./mockTestContent";
import { catalogIdForPracticeModule } from "./practiceLinks";
import { WEAK_SCORE } from "./testBoard";
import type { PaymentSummary, TutorSection } from "./tutorConsole";

/**
 * The tutor's action inbox: everything that waits on the tutor, ranked, each
 * with the one action that resolves it. Pure; the console renders the items
 * and runs the actions. `version` changes whenever the underlying situation
 * changes, so an item hidden "until it changes" comes back when it does.
 */

export type InboxKind =
  | "live"
  | "approval"
  | "grade"
  | "overdue"
  | "release"
  | "payment"
  | "weak"
  | "reminder"
  | "incidents"
  | "draft"
  | "practice-gap";

export type InboxAction =
  | { type: "approve-session"; taskId: string }
  | { type: "grade"; attemptId: string }
  | { type: "release-review"; attemptId: string }
  | { type: "unlock-bank"; storageId: string }
  | { type: "remind"; moduleIds: string[] }
  | { type: "open"; section: TutorSection; anchor: string | null }
  | { type: "open-payments" };

export interface InboxItem {
  id: string;
  kind: InboxKind;
  priority: number;
  title: string;
  detail: string;
  /** Changes when the situation changes (see "hide until it changes"). */
  version: string;
  section: TutorSection;
  action: InboxAction;
  actionLabel: string;
}

export interface InboxInput {
  nowMs: number;
  approvals: ReadonlyArray<{ taskId: string; label: string; requestedAt: string }>;
  metas: ReadonlyArray<{ moduleId: string; status: "draft" | "published" }> | null;
  attempts: readonly MockAttempt[] | null;
  reminders: readonly MockReminder[] | null;
  studentUid: string | null;
  banks: ReadonlyArray<{ storageId: string; title: string; questions: ReadonlyArray<{ moduleId: string }> }> | null;
  assignedBankIds: readonly string[] | null;
  /** Practice answers with the practice module they belong to. */
  practiceAnswers: ReadonlyArray<{ moduleId: string; answeredAtMs: number }>;
  /** Curriculum modules (catalog ids) the current plan week teaches. */
  weekCatalogIds: readonly string[];
  payment: PaymentSummary | null;
}

export const INBOX_LIMITS = { incidents: 3, reminderQuietMs: 2 * 24 * 60 * 60 * 1000, paymentSoonDays: 3 } as const;

const DAY_MS = 24 * 60 * 60 * 1000;

function label(moduleId: string): string {
  const module = mockModuleById(moduleId);
  return module ? `${mockModuleCode(module)} ${module.title}` : moduleId;
}

function codes(moduleIds: readonly string[]): string {
  return moduleIds.map((id) => { const module = mockModuleById(id); return module ? mockModuleCode(module) : id; }).join(", ");
}

/** Banks whose questions cover any of the curriculum modules, as {storageId, unlocked}. */
function banksFor(catalogIds: readonly string[], input: InboxInput): Array<{ storageId: string; title: string; unlocked: boolean }> {
  const wanted = new Set(catalogIds);
  const assigned = new Set(input.assignedBankIds ?? []);
  return (input.banks ?? [])
    .filter((bank) => bank.questions.some((question) => {
      const catalogId = catalogIdForPracticeModule(question.moduleId);
      return catalogId !== null && wanted.has(catalogId);
    }))
    .map((bank) => ({ storageId: bank.storageId, title: bank.title, unlocked: assigned.has(bank.storageId) }));
}

/** Published tests past their earliest active reminder deadline and still not taken. */
export function overdueModuleIds(input: Pick<InboxInput, "nowMs" | "metas" | "attempts" | "reminders" | "studentUid">): string[] {
  const published = new Set((input.metas ?? []).filter((meta) => meta.status === "published").map((meta) => meta.moduleId));
  const taken = new Set((input.attempts ?? []).filter((attempt) => attempt.status !== "active").map((attempt) => attempt.moduleId));
  const deadlines = new Map<string, string>();
  for (const reminder of input.reminders ?? []) {
    if (reminder.status !== "active" || !reminder.deadline) continue;
    if (input.studentUid && reminder.studentUid !== input.studentUid) continue;
    for (const moduleId of reminder.moduleIds) {
      const current = deadlines.get(moduleId);
      if (!current || reminder.deadline < current) deadlines.set(moduleId, reminder.deadline);
    }
  }
  return [...deadlines.entries()]
    .filter(([moduleId, deadline]) => published.has(moduleId) && deadlinePassed(deadline, input.nowMs) && !taken.has(moduleId))
    .map(([moduleId]) => moduleId);
}

export function buildTutorInbox(input: InboxInput): InboxItem[] {
  const items: InboxItem[] = [];
  const attempts = input.attempts ?? [];

  for (const attempt of attempts.filter((entry) => entry.status === "active")) {
    items.push({
      id: `live-${attempt.id}`, kind: "live", priority: 100, title: `Hamad is taking ${label(attempt.moduleId)}`,
      detail: `Started ${new Date(attempt.startedAtMs).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}`,
      version: attempt.id, section: "tests", action: { type: "open", section: "tests", anchor: null }, actionLabel: "Open tests",
    });
  }

  for (const approval of input.approvals) {
    items.push({
      id: `approval-${approval.taskId}`, kind: "approval", priority: 90, title: `Approve: ${approval.label}`,
      detail: `Requested ${new Date(approval.requestedAt).toLocaleString()}`, version: approval.requestedAt,
      section: "sessions", action: { type: "approve-session", taskId: approval.taskId }, actionLabel: "Approve",
    });
  }

  const finished = attempts.filter((attempt) => attempt.status !== "active");
  for (const attempt of finished.filter((entry) => entry.score === null)) {
    items.push({
      id: `grade-${attempt.id}`, kind: "grade", priority: 85, title: `Grade ${label(attempt.moduleId)}`,
      detail: "Submitted but not graded yet", version: String(attempt.submittedAtMs),
      section: "tests", action: { type: "grade", attemptId: attempt.id }, actionLabel: "Grade",
    });
  }

  const overdue = overdueModuleIds(input);
  if (overdue.length) {
    items.push({
      id: "overdue", kind: "overdue", priority: 80,
      title: `${overdue.length} ${overdue.length === 1 ? "test is" : "tests are"} overdue`,
      detail: codes(overdue), version: overdue.join(","), section: "tests",
      action: { type: "remind", moduleIds: overdue }, actionLabel: "Remind Hamad",
    });
  }

  for (const attempt of finished.filter((entry) => entry.score !== null && !entry.reviewReleased)) {
    items.push({
      id: `release-${attempt.id}`, kind: "release", priority: 70, title: `Release the review of ${label(attempt.moduleId)}`,
      detail: `Hamad scored ${attempt.score}/8; he sees only the score until you release it`, version: String(attempt.submittedAtMs),
      section: "tests", action: { type: "release-review", attemptId: attempt.id }, actionLabel: "Release review",
    });
  }

  if (input.payment?.state === "overdue") {
    items.push({
      id: "payment", kind: "payment", priority: 65, title: "A payment is overdue",
      detail: `${input.payment.overdueCount} overdue · ${input.payment.currency} ${input.payment.outstanding.toLocaleString()} open`,
      version: `overdue-${input.payment.overdueCount}-${input.payment.outstanding}`, section: "overview",
      action: { type: "open-payments" }, actionLabel: "Open payments",
    });
  } else if (input.payment && input.payment.state === "due") {
    const daysLeft = Math.round((new Date(`${input.payment.nextDue}T00:00:00`).getTime() - input.nowMs) / DAY_MS);
    if (daysLeft <= INBOX_LIMITS.paymentSoonDays) {
      items.push({
        id: "payment", kind: "payment", priority: 30, title: "Payment due soon",
        detail: `Next billing day ${input.payment.nextDue}`, version: `due-${input.payment.nextDue}`, section: "overview",
        action: { type: "open-payments" }, actionLabel: "Open payments",
      });
    }
  }

  // Weak results with no practice on that curriculum module since the test.
  for (const attempt of finished.filter((entry) => entry.score !== null && entry.score < WEAK_SCORE && entry.status === "submitted")) {
    const module = mockModuleById(attempt.moduleId);
    if (!module) continue;
    const since = attempt.submittedAtMs ?? 0;
    const practisedSince = input.practiceAnswers.some((answer) => {
      const catalogId = catalogIdForPracticeModule(answer.moduleId);
      return catalogId !== null && module.catalogIds.includes(catalogId) && answer.answeredAtMs >= since;
    });
    if (practisedSince) continue;
    const candidates = banksFor(module.catalogIds, input);
    const locked = candidates.find((bank) => !bank.unlocked);
    const anyUnlocked = candidates.some((bank) => bank.unlocked);
    items.push({
      id: `weak-${attempt.id}`, kind: "weak", priority: 60, title: `${mockModuleCode(module)} ${module.title}: ${attempt.score}/8, no practice since`,
      detail: anyUnlocked ? "A practice set is unlocked but not used yet" : locked ? `Unlock "${locked.title}" for repair` : "No practice bank covers this module yet",
      version: `${attempt.id}-${attempt.score}`, section: "practice",
      action: !anyUnlocked && locked ? { type: "unlock-bank", storageId: locked.storageId } : { type: "open", section: "practice", anchor: null },
      actionLabel: !anyUnlocked && locked ? "Unlock practice" : "Open practice",
    });
  }

  for (const reminder of (input.reminders ?? []).filter((entry) => entry.status === "active")) {
    const quietSince = reminder.seenAtMs ?? reminder.editedAtMs ?? reminder.createdAtMs;
    if (input.nowMs - quietSince < INBOX_LIMITS.reminderQuietMs || reminder.acknowledgedAtMs !== null) continue;
    items.push({
      id: `reminder-${reminder.id}`, kind: "reminder", priority: 50,
      title: reminder.seenAtMs === null ? "Reminder not opened for 2+ days" : "Reminder seen but not acknowledged",
      detail: `${codes(reminder.moduleIds)}${reminder.deadline ? ` · due ${reminder.deadline}` : ""}`,
      version: `${reminder.id}-${reminder.editedAtMs ?? reminder.createdAtMs}-${reminder.seenAtMs ?? 0}`, section: "tests",
      action: { type: "remind", moduleIds: reminder.moduleIds }, actionLabel: "Follow up",
    });
  }

  for (const attempt of finished.filter((entry) => entry.incidents.length >= INBOX_LIMITS.incidents)) {
    items.push({
      id: `incidents-${attempt.id}`, kind: "incidents", priority: 45,
      title: `${label(attempt.moduleId)}: ${attempt.incidents.length} focus incidents`,
      detail: "Left full screen or switched apps during the test", version: `${attempt.id}-${attempt.incidents.length}`,
      section: "tests", action: { type: "open", section: "tests", anchor: null }, actionLabel: "Review attempt",
    });
  }

  const drafts = (input.metas ?? []).filter((meta) => meta.status === "draft").map((meta) => meta.moduleId);
  if (drafts.length) {
    items.push({
      id: "drafts", kind: "draft", priority: 40, title: `${drafts.length} ${drafts.length === 1 ? "draft" : "drafts"} to review and publish`,
      detail: codes(drafts), version: drafts.join(","), section: "tests",
      action: { type: "open", section: "tests", anchor: null }, actionLabel: "Open tests",
    });
  }

  // This week's curriculum modules with practice banks still locked.
  if (input.weekCatalogIds.length && input.banks) {
    const lockedThisWeek = banksFor(input.weekCatalogIds, input).filter((bank) => !bank.unlocked);
    for (const bank of lockedThisWeek) {
      items.push({
        id: `gap-${bank.storageId}`, kind: "practice-gap", priority: 35, title: `Unlock "${bank.title}" for this week`,
        detail: "It covers a module taught this week", version: bank.storageId, section: "practice",
        action: { type: "unlock-bank", storageId: bank.storageId }, actionLabel: "Unlock",
      });
    }
  }

  return items.sort((left, right) => right.priority - left.priority || left.title.localeCompare(right.title));
}

// ------------------------------------------------------------------- snooze

/** Per-device snoozes: until a time, or until the item's version changes. */
export type InboxSnoozes = Record<string, { untilMs?: number; version?: string }>;

export function isSnoozed(item: InboxItem, snoozes: InboxSnoozes, nowMs: number): boolean {
  const snooze = snoozes[item.id];
  if (!snooze) return false;
  if (snooze.untilMs !== undefined) return nowMs < snooze.untilMs;
  return snooze.version === item.version;
}

export const INBOX_SNOOZE_KEY = "hamad-coach-inbox-snoozes";

export function loadSnoozes(): InboxSnoozes {
  try {
    const value = JSON.parse(localStorage.getItem(INBOX_SNOOZE_KEY) ?? "{}") as unknown;
    return typeof value === "object" && value !== null ? (value as InboxSnoozes) : {};
  } catch {
    return {};
  }
}

export function saveSnoozes(snoozes: InboxSnoozes): void {
  try { localStorage.setItem(INBOX_SNOOZE_KEY, JSON.stringify(snoozes)); } catch { /* Keep working in memory. */ }
}
