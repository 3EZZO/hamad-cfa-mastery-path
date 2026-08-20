export const PROGRAM_START = "2026-08-23";
export const EXAM_DATE = "2027-02-27";
export const TOTAL_WEEKS = 27;

const DAY_MS = 86_400_000;

/**
 * Accepts only a real Gregorian calendar date in the project's date-only
 * wire format. Date's normal rollover behaviour must not turn values such as
 * 2026-02-30 into a different, apparently valid day.
 */
export function isValidDateOnly(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year!, month! - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month! - 1 &&
    date.getUTCDate() === day
  );
}

export function parseDateOnly(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) {
    throw new Error(`Invalid date-only value: ${value}`);
  }
  return new Date(year, month - 1, day, 12, 0, 0, 0);
}

export function toDateOnly(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function addDays(value: string, days: number): string {
  const date = parseDateOnly(value);
  date.setDate(date.getDate() + days);
  return toDateOnly(date);
}

export function differenceInCalendarDays(later: Date, earlier: Date): number {
  const laterUtc = Date.UTC(
    later.getFullYear(),
    later.getMonth(),
    later.getDate(),
  );
  const earlierUtc = Date.UTC(
    earlier.getFullYear(),
    earlier.getMonth(),
    earlier.getDate(),
  );
  return Math.round((laterUtc - earlierUtc) / DAY_MS);
}

export function daysUntilExam(today = new Date()): number {
  return Math.max(0, differenceInCalendarDays(parseDateOnly(EXAM_DATE), today));
}

/** Returns 0 before launch, 1-27 during the plan, and 28 after exam day. */
export function getProgramWeek(today = new Date()): number {
  const fromStart = differenceInCalendarDays(today, parseDateOnly(PROGRAM_START));
  if (fromStart < 0) return 0;
  if (differenceInCalendarDays(today, parseDateOnly(EXAM_DATE)) > 0) {
    return TOTAL_WEEKS + 1;
  }
  return Math.min(TOTAL_WEEKS, Math.floor(fromStart / 7) + 1);
}

export function getWeekDates(week: number): {
  startDate: string;
  endDate: string;
} {
  if (!Number.isInteger(week) || week < 1 || week > TOTAL_WEEKS) {
    throw new Error(`Week must be between 1 and ${TOTAL_WEEKS}`);
  }
  const startDate = addDays(PROGRAM_START, (week - 1) * 7);
  return { startDate, endDate: addDays(startDate, 6) };
}

export function formatDate(
  value: string,
  options: Intl.DateTimeFormatOptions = {
    day: "numeric",
    month: "short",
    year: "numeric",
  },
): string {
  return new Intl.DateTimeFormat("en-GB", options).format(parseDateOnly(value));
}

export function todayDateOnly(): string {
  return toDateOnly(new Date());
}
