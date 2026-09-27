import { describe, expect, it } from "vitest";
import {
  deadlineCountdown,
  deadlinePassed,
  deadlineUrgent,
  isReminderDate,
  localDay,
  pickReminderToShow,
  reminderProgress,
  shouldShowReminder,
  validateReminderDraft,
  type MockReminder,
} from "./mockReminders";

const at = (y: number, m: number, d: number, h = 12, min = 0) => new Date(y, m - 1, d, h, min).getTime();

function reminder(overrides: Partial<MockReminder> = {}): MockReminder {
  return {
    id: "r1",
    studentUid: "student",
    message: "Please complete your tests.",
    deadline: "2026-10-01",
    moduleIds: ["m04-probability-trees", "m05-portfolio-mathematics"],
    status: "active",
    createdAtMs: at(2026, 9, 27, 9),
    createdBy: "tutor",
    editedAtMs: null,
    cancelledAtMs: null,
    seenAtMs: null,
    acknowledgedAtMs: null,
    ...overrides,
  };
}

const pending = ["m04-probability-trees", "m05-portfolio-mathematics"];

describe("shouldShowReminder", () => {
  it("shows an unacknowledged active reminder while listed modules are pending", () => {
    expect(shouldShowReminder(reminder(), pending, at(2026, 9, 27))).toBe(true);
  });

  it("stops once every listed module is completed", () => {
    expect(shouldShowReminder(reminder(), ["m09-parametric-nonparametric"], at(2026, 9, 27))).toBe(false);
    expect(shouldShowReminder(reminder(), [], at(2026, 9, 27))).toBe(false);
  });

  it("never shows a cancelled reminder", () => {
    expect(shouldShowReminder(reminder({ status: "cancelled" }), pending, at(2026, 9, 27))).toBe(false);
  });

  it("does not show again on the same day after Got it", () => {
    const acknowledged = reminder({ acknowledgedAtMs: at(2026, 9, 27, 10) });
    expect(shouldShowReminder(acknowledged, pending, at(2026, 9, 27, 23, 59))).toBe(false);
  });

  it("shows again once per day before the deadline while tests are pending", () => {
    const acknowledged = reminder({ acknowledgedAtMs: at(2026, 9, 27, 10) });
    expect(shouldShowReminder(acknowledged, pending, at(2026, 9, 28, 0, 1))).toBe(true);
    expect(shouldShowReminder(acknowledged, pending, at(2026, 10, 1, 22))).toBe(true);
  });

  it("stops after the deadline day has passed", () => {
    expect(shouldShowReminder(reminder(), pending, at(2026, 10, 2, 0, 1))).toBe(false);
  });

  it("does not repeat a reminder without a deadline once acknowledged", () => {
    const noDeadline = reminder({ deadline: null, acknowledgedAtMs: at(2026, 9, 27, 10) });
    expect(shouldShowReminder(noDeadline, pending, at(2026, 9, 30))).toBe(false);
    expect(shouldShowReminder(reminder({ deadline: null }), pending, at(2026, 12, 30))).toBe(true);
  });
});

describe("pickReminderToShow", () => {
  it("picks the newest qualifying reminder", () => {
    const older = reminder({ id: "old", createdAtMs: at(2026, 9, 20) });
    const newer = reminder({ id: "new", createdAtMs: at(2026, 9, 26) });
    const cancelled = reminder({ id: "gone", createdAtMs: at(2026, 9, 27), status: "cancelled" });
    expect(pickReminderToShow([older, cancelled, newer], pending, at(2026, 9, 27))?.id).toBe("new");
    expect(pickReminderToShow([cancelled], pending, at(2026, 9, 27))).toBeNull();
  });
});

describe("deadline helpers", () => {
  it("counts calendar days and flags the final 24 hours", () => {
    expect(deadlineCountdown("2026-10-01", at(2026, 9, 27, 18))).toBe("4 days left");
    expect(deadlineCountdown("2026-10-01", at(2026, 9, 30, 8))).toBe("1 day left");
    expect(deadlineCountdown("2026-10-01", at(2026, 10, 1, 8))).toBe("Due today");
    expect(deadlineCountdown("2026-10-01", at(2026, 10, 2, 8))).toBe("Deadline passed");
    // The deadline is the end of 1 October, so the last 24 hours start at midnight.
    expect(deadlineUrgent("2026-10-01", at(2026, 10, 1, 0, 30))).toBe(true);
    expect(deadlineUrgent("2026-10-01", at(2026, 9, 30, 23, 30))).toBe(false);
    expect(deadlineUrgent("2026-10-01", at(2026, 10, 2, 8))).toBe(false);
    expect(deadlineUrgent(null, at(2026, 9, 30, 8))).toBe(false);
    expect(deadlinePassed("2026-10-01", at(2026, 10, 1, 23, 59))).toBe(false);
  });

  it("validates real calendar dates", () => {
    expect(isReminderDate("2026-10-01")).toBe(true);
    expect(isReminderDate("2026-02-30")).toBe(false);
    expect(isReminderDate("1/10/2026")).toBe(false);
    expect(localDay(at(2026, 9, 7, 1))).toBe("2026-09-07");
  });
});

describe("reminderProgress", () => {
  it("reports the tutor-facing status", () => {
    expect(reminderProgress(reminder(), [], at(2026, 9, 27))).toBe("sent");
    expect(reminderProgress(reminder({ seenAtMs: at(2026, 9, 27) }), [], at(2026, 9, 27))).toBe("seen");
    expect(reminderProgress(reminder({ seenAtMs: 1, acknowledgedAtMs: 2 }), [], at(2026, 9, 27))).toBe("acknowledged");
    expect(reminderProgress(reminder(), pending, at(2026, 9, 27))).toBe("completed");
    expect(reminderProgress(reminder(), [], at(2026, 10, 3))).toBe("expired");
    expect(reminderProgress(reminder({ status: "cancelled" }), pending, at(2026, 9, 27))).toBe("cancelled");
  });
});

describe("validateReminderDraft", () => {
  const draft = { studentUid: "s", message: "Hi", deadline: null, moduleIds: ["m04-probability-trees"] };
  it("accepts a complete draft and explains what is missing", () => {
    expect(validateReminderDraft(draft)).toBeNull();
    expect(validateReminderDraft({ ...draft, message: "  " })).toMatch(/message/);
    expect(validateReminderDraft({ ...draft, moduleIds: [] })).toMatch(/module/);
    expect(validateReminderDraft({ ...draft, deadline: "2026-13-01" })).toMatch(/deadline/);
    expect(validateReminderDraft({ ...draft, studentUid: "" })).toMatch(/student/);
  });
});
