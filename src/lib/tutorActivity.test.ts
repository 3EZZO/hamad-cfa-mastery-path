import { describe, expect, it } from "vitest";
import type { MockReminder } from "./mockReminders";
import type { MockAttempt, MockAttemptHistoryEntry } from "./mockTestContent";
import type { PracticeRun } from "./practiceContent";
import { activityDayLabel, buildActivity, filterActivity, type ActivityInput } from "./tutorActivity";

const NOW = new Date(2026, 9, 10, 15, 0, 0).getTime();
const HOUR = 60 * 60 * 1000;

const empty: ActivityInput = {
  attempts: [], history: [], runs: [], sessionRequests: [], sessionReviews: [], reminders: [], mistakes: [], payments: [], currency: "SAR",
};

describe("buildActivity", () => {
  it("lists every kind of event newest first", () => {
    const events = buildActivity({
      ...empty,
      attempts: [{
        id: "s_e06-international-trade", moduleId: "e06-international-trade", status: "submitted", startedAtMs: NOW - 3 * HOUR,
        submittedAtMs: NOW - 2.9 * HOUR, score: 6, incidents: [{}], reviewReleased: true, attemptNumber: 1,
      } as unknown as MockAttempt],
      history: [{ id: "s_m01-rates-and-returns", moduleId: "m01-rates-and-returns", attemptNumber: 1, score: 3, archivedAtMs: NOW - 50 * HOUR } as unknown as MockAttemptHistoryEntry],
      runs: [{
        id: "run1", mode: "module", answers: [{ correct: true }, { correct: false }, { correct: true }, { correct: true }],
        startedAtClient: new Date(NOW - 5 * HOUR).toISOString(), updatedAtClient: new Date(NOW - 4.5 * HOUR).toISOString(),
        completedAtClient: new Date(NOW - 4.5 * HOUR).toISOString(),
      } as unknown as PracticeRun],
      sessionRequests: [{ taskId: "w5-session-1", label: "Session 05", requestedAt: new Date(NOW - 6 * HOUR).toISOString() }],
      sessionReviews: [{ taskId: "w4-session-1", label: "Session 04", reviewedAt: new Date(NOW - 30 * HOUR).toISOString(), status: "returned", note: "Redo the FX set" }],
      reminders: [{
        id: "r1", moduleIds: ["e06-international-trade"], deadline: "2026-10-12", createdAtMs: NOW - 26 * HOUR,
        seenAtMs: NOW - 20 * HOUR, acknowledgedAtMs: NOW - 19 * HOUR, cancelledAtMs: null,
      } as unknown as MockReminder],
      mistakes: [{ id: "m1", date: "2026-10-08", topic: "Economics" }],
      payments: [{ id: "p1", dateRecorded: "2026-10-01", amount: 2000, status: "paid" }],
    });
    expect(events.map((event) => event.title)).toEqual([
      "Submitted EC6 International Trade",
      "Started EC6 International Trade",
      "Module set completed",
      "Asked to complete Session 05",
      "Reminder acknowledged",
      "Reminder opened by Hamad",
      "Reminder sent",
      "Returned Session 04",
      "Attempt reset: QM1 Rates and Returns",
      "Mistake logged",
      "Payment paid",
    ]);
    expect(events[0]!.detail).toBe("6/8 · 1 focus incidents · Review released");
    expect(events[2]!.detail).toBe("4 answered · 75% correct");
    expect(events.at(-1)!.detail).toBe("SAR 2,000");
  });

  it("filters by kind and by the last 7 or 30 days", () => {
    const events = buildActivity({
      ...empty,
      mistakes: [{ id: "a", date: "2026-10-09", topic: "Quant" }, { id: "b", date: "2026-09-20", topic: "Quant" }, { id: "c", date: "2026-08-01", topic: "Quant" }],
      payments: [{ id: "p", dateRecorded: "2026-10-09", amount: 1, status: "paid" }],
    });
    const mistakesOnly = new Set(["mistake"] as const);
    expect(filterActivity(events, mistakesOnly, "7", NOW).map((event) => event.id)).toEqual(["mistake-a"]);
    expect(filterActivity(events, mistakesOnly, "30", NOW)).toHaveLength(2);
    expect(filterActivity(events, mistakesOnly, "all", NOW)).toHaveLength(3);
  });
});

describe("activityDayLabel", () => {
  it("names today and yesterday", () => {
    expect(activityDayLabel(NOW - HOUR, NOW)).toBe("Today");
    expect(activityDayLabel(NOW - 20 * HOUR, NOW)).toBe("Yesterday");
    expect(activityDayLabel(NOW - 72 * HOUR, NOW)).not.toBe("Yesterday");
  });
});
