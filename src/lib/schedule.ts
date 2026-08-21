import { getWeekSessions, PLAN } from "../data/plan";
import type {
  PlanSession,
  PlanWeek,
  SessionOverride,
} from "../types";
import {
  addDays,
  EXAM_DATE,
  isValidDateOnly,
  parseDateOnly,
  PROGRAM_START,
} from "./dates";

export interface ScheduledSession {
  week: PlanWeek;
  session: PlanSession;
  effectiveDate: string;
  rescheduled: boolean;
  reason: string | null;
}

export interface CascadeRescheduleResult {
  overrides: Record<string, SessionOverride>;
  changedSessionNumbers: number[];
  finalSessionDate: string;
}

const SESSIONS = PLAN.flatMap((week) =>
  getWeekSessions(week).map((session) => ({ week, session })),
).sort((left, right) => left.session.number - right.session.number);

function weekKey(value: string): string {
  const date = parseDateOnly(value);
  date.setDate(date.getDate() - date.getDay());
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function allowedTutorDate(session: PlanSession, value: string): boolean {
  return value === session.date || value === addDays(session.date, -1);
}

/**
 * Validates the complete effective calendar produced by a partial override
 * map. This is intentionally independent of storage normalization so cloud,
 * backup, and tutor-console callers share one schedule invariant without a
 * storage/schedule import cycle.
 */
export function validateEffectiveSessionSchedule(
  overrides: Record<string, SessionOverride>,
): void {
  if (Object.keys(overrides).length > SESSIONS.length) {
    throw new Error("The schedule contains too many session overrides.");
  }

  for (const [key, override] of Object.entries(overrides)) {
    const sessionNumber = Number(key);
    if (
      !Number.isInteger(sessionNumber) ||
      String(sessionNumber) !== key ||
      override.sessionNumber !== sessionNumber ||
      !SESSIONS.some((entry) => entry.session.number === sessionNumber)
    ) {
      throw new Error("Every schedule override must identify one planned session.");
    }
    if (!isValidDateOnly(override.date)) {
      throw new Error(
        `Session ${String(sessionNumber).padStart(2, "0")} has an invalid calendar date.`,
      );
    }
  }

  const effective = getEffectiveSessions(overrides);
  if (effective.length !== SESSIONS.length) {
    throw new Error(
      `The effective schedule must contain all ${SESSIONS.length} weekly checkpoints.`,
    );
  }

  const occupiedByWeek = new Map<string, number>();
  let previousDate: string | null = null;
  for (const entry of effective) {
    const { number } = entry.session;
    const date = entry.effectiveDate;
    if (!isValidDateOnly(date) || date < PROGRAM_START || date >= EXAM_DATE) {
      throw new Error(
        `Session ${String(number).padStart(2, "0")} must fall inside the program and before exam day.`,
      );
    }
    if (!allowedTutorDate(entry.session, date)) {
      throw new Error(
        `Session ${String(number).padStart(2, "0")} must use its planned Saturday or the immediately preceding Friday.`,
      );
    }
    if (previousDate !== null && date <= previousDate) {
      throw new Error("Tutor sessions must remain in strict chronological order.");
    }
    previousDate = date;

    const key = weekKey(date);
    const count = (occupiedByWeek.get(key) ?? 0) + 1;
    if (count > 1) {
      throw new Error("No Sunday-Saturday week may contain more than one tutor checkpoint.");
    }
    occupiedByWeek.set(key, count);
  }
}

export function effectiveSessionDate(
  session: PlanSession,
  overrides: Record<string, SessionOverride>,
): string {
  return overrides[String(session.number)]?.date ?? session.date;
}

export function getEffectiveSessions(
  overrides: Record<string, SessionOverride>,
): ScheduledSession[] {
  return SESSIONS.map(({ week, session }) => {
    const override = overrides[String(session.number)];
    return {
      week,
      session,
      effectiveDate: override?.date ?? session.date,
      rescheduled: Boolean(override && override.date !== session.date),
      reason: override?.reason ?? null,
    };
  });
}

export function sessionDayLabel(date: string): string {
  const day = parseDateOnly(date).getDay();
  if (day === 6) return "Saturday checkpoint";
  if (day === 5) return "Friday exception";
  return new Intl.DateTimeFormat("en-GB", { weekday: "long" }).format(
    parseDateOnly(date),
  );
}

/**
 * Moves one checkpoint only between its canonical Saturday and the
 * immediately preceding Friday. Later checkpoints never cascade: the fixed
 * weekly rhythm and exam buffer remain intact.
 */
export function cascadeReschedule(
  currentOverrides: Record<string, SessionOverride>,
  sessionNumber: number,
  newDate: string,
  reason: string,
  updatedAt = new Date().toISOString(),
): CascadeRescheduleResult {
  if (!Number.isInteger(sessionNumber) || sessionNumber < 1 || sessionNumber > SESSIONS.length) {
    throw new Error("Choose a valid tutor session.");
  }
  if (!isValidDateOnly(newDate) || newDate < PROGRAM_START || newDate >= EXAM_DATE) {
    throw new Error("The new date must fall inside the program and before exam day.");
  }
  const planned = SESSIONS.find(
    (entry) => entry.session.number === sessionNumber,
  );
  if (!planned) throw new Error("Choose a valid tutor session.");
  if (!allowedTutorDate(planned.session, newDate)) {
    throw new Error(
      "Choose the planned Saturday or the immediately preceding Friday.",
    );
  }

  const current = getEffectiveSessions(currentOverrides);
  const target = current.find(
    (entry) => entry.session.number === sessionNumber,
  );
  if (!target) throw new Error("Choose a valid tutor session.");

  const targetReason = reason.trim() || "Tutor-approved schedule adjustment";
  const overrides = { ...currentOverrides };
  if (newDate === planned.session.date) {
    delete overrides[String(sessionNumber)];
  } else if (newDate !== target.effectiveDate) {
    overrides[String(sessionNumber)] = {
      sessionNumber,
      date: newDate,
      reason: targetReason,
      updatedAt,
    };
  }

  validateEffectiveSessionSchedule(overrides);
  const effective = getEffectiveSessions(overrides);

  return {
    overrides,
    changedSessionNumbers:
      newDate === target.effectiveDate ? [] : [sessionNumber],
    finalSessionDate: effective.at(-1)!.effectiveDate,
  };
}

export function restoreCanonicalSession(
  currentOverrides: Record<string, SessionOverride>,
  sessionNumber: number,
): Record<string, SessionOverride> {
  const overrides = { ...currentOverrides };
  delete overrides[String(sessionNumber)];
  validateEffectiveSessionSchedule(overrides);
  return overrides;
}
