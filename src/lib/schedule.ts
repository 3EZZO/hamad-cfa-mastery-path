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

function allowedTutorDate(sessionNumber: number, value: string): boolean {
  if (sessionNumber === 68 && value === "2027-02-26") return true;
  const day = parseDateOnly(value).getDay();
  return day === 1 || day === 3 || day === 6;
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
  if (effective.length !== 68) {
    throw new Error("The effective schedule must contain all 68 sessions.");
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
    if (!allowedTutorDate(number, date)) {
      throw new Error(
        `Session ${String(number).padStart(2, "0")} must use the Monday, Wednesday, or Saturday cadence; Session 68 may use the planned pre-exam Friday.`,
      );
    }
    if (previousDate !== null && date <= previousDate) {
      throw new Error("Tutor sessions must remain in strict chronological order.");
    }
    previousDate = date;

    const key = weekKey(date);
    const count = (occupiedByWeek.get(key) ?? 0) + 1;
    if (count > 3) {
      throw new Error("No Sunday-Saturday week may contain more than three tutor sessions.");
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
  if (day === 1) return "Monday intensive";
  if (day === 3) return "Wednesday midweek";
  if (day === 5) return "Friday pre-exam";
  if (day === 6) return "Saturday weekend";
  return new Intl.DateTimeFormat("en-GB", { weekday: "long" }).format(
    parseDateOnly(date),
  );
}

function nextAvailableDate(
  after: string,
  occupiedByWeek: Map<string, number>,
  sessionNumber: number,
): string {
  let candidate = addDays(after, 1);
  while (candidate < EXAM_DATE) {
    const count = occupiedByWeek.get(weekKey(candidate)) ?? 0;
    if (allowedTutorDate(sessionNumber, candidate) && count < 3) return candidate;
    candidate = addDays(candidate, 1);
  }
  throw new Error(
    "There is not enough room to move these sessions without reaching exam day.",
  );
}

/**
 * Move one session and automatically reflow only the later sessions that
 * collide. Existing dates are retained whenever they still fit. The cadence
 * remains Monday/Wednesday/Saturday, with no more than three sessions in a
 * Sunday-Saturday week, and Session 68 must remain before exam day.
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
  if (!allowedTutorDate(sessionNumber, newDate)) {
    throw new Error(
      "Choose a Monday, Wednesday, or Saturday tutor date before exam day.",
    );
  }

  const current = getEffectiveSessions(currentOverrides);
  const targetIndex = current.findIndex(
    (entry) => entry.session.number === sessionNumber,
  );
  const previous = current[targetIndex - 1];
  if (previous && newDate <= previous.effectiveDate) {
    throw new Error(
      `Session ${String(sessionNumber).padStart(2, "0")} must remain after Session ${String(previous.session.number).padStart(2, "0")}.`,
    );
  }

  const dates = current.map((entry) => entry.effectiveDate);
  dates[targetIndex] = newDate;
  const occupiedByWeek = new Map<string, number>();
  for (let index = 0; index <= targetIndex; index += 1) {
    const date = dates[index]!;
    const key = weekKey(date);
    occupiedByWeek.set(key, (occupiedByWeek.get(key) ?? 0) + 1);
    if ((occupiedByWeek.get(key) ?? 0) > 3) {
      throw new Error("The selected week would contain more than three tutor sessions.");
    }
  }

  for (let index = targetIndex + 1; index < current.length; index += 1) {
    const preferred = current[index]!.effectiveDate;
    const previousDate = dates[index - 1]!;
    const preferredWeek = weekKey(preferred);
    if (
      preferred > previousDate &&
      allowedTutorDate(current[index]!.session.number, preferred) &&
      (occupiedByWeek.get(preferredWeek) ?? 0) < 3
    ) {
      dates[index] = preferred;
    } else {
      dates[index] = nextAvailableDate(
        previousDate,
        occupiedByWeek,
        current[index]!.session.number,
      );
    }
    const key = weekKey(dates[index]!);
    occupiedByWeek.set(key, (occupiedByWeek.get(key) ?? 0) + 1);
  }

  if (dates.at(-1)! >= EXAM_DATE) {
    throw new Error("The revised schedule would reach exam day.");
  }

  const targetReason = reason.trim() || "Tutor-approved schedule adjustment";
  const overrides: Record<string, SessionOverride> = {};
  const changedSessionNumbers: number[] = [];
  current.forEach((entry, index) => {
    const date = dates[index]!;
    const number = entry.session.number;
    const existingOverride = currentOverrides[String(number)];
    const dateChanged = date !== entry.effectiveDate;

    if (dateChanged) changedSessionNumbers.push(number);

    // A canonical date is represented by the absence of an override. This also
    // removes a prior override when a cascade moves the session back home.
    if (date === entry.session.date) return;

    // Do not rewrite audit history for dates the cascade did not change. This
    // applies to overrides before the selected session and to later overrides
    // that still fit after the reflow.
    if (
      !dateChanged &&
      existingOverride &&
      existingOverride.date === date
    ) {
      overrides[String(number)] = existingOverride;
      return;
    }

    overrides[String(number)] = {
      sessionNumber: number,
      date,
      reason:
        number === sessionNumber
          ? targetReason
          : `Automatic reflow after Session ${String(sessionNumber).padStart(2, "0")}: ${targetReason}`,
      updatedAt,
    };
  });

  validateEffectiveSessionSchedule(overrides);

  return {
    overrides,
    changedSessionNumbers,
    finalSessionDate: dates.at(-1)!,
  };
}

export function restoreCanonicalScheduleFrom(
  currentOverrides: Record<string, SessionOverride>,
  sessionNumber: number,
): Record<string, SessionOverride> {
  return Object.fromEntries(
    Object.entries(currentOverrides).filter(
      ([key]) => Number(key) < sessionNumber,
    ),
  );
}
