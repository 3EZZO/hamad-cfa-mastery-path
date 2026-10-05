import { mockModuleById, mockModuleCode } from "../data/mockModules";
import { deadlineCountdown, deadlinePassed, formatReminderDate, localDay, REMINDER_MESSAGE_MAX, type MockReminder, type ReminderDraft } from "./mockReminders";

/**
 * The tutor's smart reminder tools: messages written from the chosen tests,
 * the deadline and Hamad's recent results in a chosen tone; "mark overdue"
 * (a reminder whose deadline was yesterday, so the tests show as overdue on
 * Hamad's Tests page); and "clear deadline" (take tests out of the active
 * reminders that date them). Pure; the panels send the drafts.
 */

export type ReminderTone = "friendly" | "firm" | "overdue";

export const REMINDER_TONES: ReadonlyArray<{ id: ReminderTone; label: string }> = [
  { id: "friendly", label: "Friendly" },
  { id: "firm", label: "Firm" },
  { id: "overdue", label: "Overdue" },
];

/** A composer preset handed to the reminder panel (e.g. from the inbox). */
export interface ReminderPreset {
  moduleIds: string[];
  tone: ReminderTone;
  deadline?: string | null;
}

function name(moduleId: string): string {
  const module = mockModuleById(moduleId);
  return module ? `${mockModuleCode(module)} ${module.title}` : moduleId;
}

function code(moduleId: string): string {
  const module = mockModuleById(moduleId);
  return module ? mockModuleCode(module) : moduleId;
}

/** "EC6 International Trade", "EC6 … and EC7 …", or "5 module tests (EC1, EC2, …)". */
export function moduleListText(moduleIds: readonly string[]): string {
  if (moduleIds.length === 0) return "your module tests";
  if (moduleIds.length === 1) return `the ${name(moduleIds[0]!)} test`;
  if (moduleIds.length <= 3) {
    const names = moduleIds.map(name);
    return `the ${names.slice(0, -1).join(", ")} and ${names.at(-1)} tests`;
  }
  return `${moduleIds.length} module tests (${moduleIds.map(code).join(", ")})`;
}

export function composeReminderMessage(input: {
  moduleIds: readonly string[];
  deadline: string | null;
  nowMs: number;
  tone: ReminderTone;
  /** Recent results to acknowledge, newest first. */
  recent?: ReadonlyArray<{ moduleId: string; score: number }>;
}): string {
  const list = moduleListText(input.moduleIds);
  const them = input.moduleIds.length === 1 ? "it" : "them";
  const isAre = input.moduleIds.length === 1 ? "is" : "are";
  const passed = input.deadline !== null && deadlinePassed(input.deadline, input.nowMs);
  const by = input.deadline && !passed
    ? ` by ${formatReminderDate(input.deadline)} (${deadlineCountdown(input.deadline, input.nowMs).toLowerCase()})`
    : "";
  const best = input.recent?.find((result) => result.score >= 6);
  const greeting = best ? `Hi Hamad, good work on ${code(best.moduleId)} (${best.score}/8). Please` : "Hi Hamad, please";
  let message: string;
  if (input.tone === "friendly") {
    message = `${greeting} complete ${list}${by}. Each one is 8 questions; find a quiet slot and keep your calculator ready. Thank you!`;
  } else if (input.tone === "firm") {
    message = `Hamad, ${list} ${isAre} still outstanding. Please complete ${them}${by || " as soon as possible"}. Staying on schedule matters for the plan; tell me today if anything is in the way.`;
  } else {
    const was = input.deadline ? ` (the deadline was ${formatReminderDate(input.deadline)})` : "";
    message = `Hamad, ${list} ${isAre} now overdue${was}. Please complete ${them} today. If you are stuck on the material, message me and we will go through it in the next session.`;
  }
  return message.length > REMINDER_MESSAGE_MAX ? message.slice(0, REMINDER_MESSAGE_MAX) : message;
}

/** The local calendar day before `nowMs`. */
export function yesterday(nowMs: number): string {
  const today = new Date(nowMs);
  return localDay(new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1, 12).getTime());
}

/** A reminder that makes the tests overdue now: its deadline was yesterday. */
export function overdueDraft(studentUid: string, moduleIds: readonly string[], nowMs: number): ReminderDraft {
  const deadline = yesterday(nowMs);
  return {
    studentUid,
    moduleIds: [...moduleIds],
    deadline,
    message: composeReminderMessage({ moduleIds, deadline, nowMs, tone: "overdue" }),
  };
}

export type DeadlineChange =
  | { type: "cancel"; reminder: MockReminder }
  | { type: "edit"; reminder: MockReminder; draft: ReminderDraft };

/**
 * Takes the tests out of every active, dated reminder for the student: the
 * reminder is cancelled when nothing else is left in it, otherwise re-saved
 * without them.
 */
export function clearDeadlineChanges(
  reminders: readonly MockReminder[],
  studentUid: string,
  moduleIds: readonly string[],
): DeadlineChange[] {
  const clearing = new Set(moduleIds);
  return reminders
    .filter((reminder) => reminder.status === "active" && reminder.deadline !== null && reminder.studentUid === studentUid
      && reminder.moduleIds.some((id) => clearing.has(id)))
    .map((reminder): DeadlineChange => {
      const remaining = reminder.moduleIds.filter((id) => !clearing.has(id));
      return remaining.length === 0
        ? { type: "cancel", reminder }
        : { type: "edit", reminder, draft: { studentUid, message: reminder.message, deadline: reminder.deadline, moduleIds: remaining } };
    });
}

/** `YYYY-MM-DD`, `days` calendar days after `nowMs`. */
export function daysFromNow(nowMs: number, days: number): string {
  const today = new Date(nowMs);
  return localDay(new Date(today.getFullYear(), today.getMonth(), today.getDate() + days, 12).getTime());
}
