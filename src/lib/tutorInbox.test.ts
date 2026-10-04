import { describe, expect, it } from "vitest";
import type { MockReminder } from "./mockReminders";
import type { MockAttempt } from "./mockTestContent";
import { buildTutorInbox, isSnoozed, type InboxInput } from "./tutorInbox";

const NOW = new Date(2026, 9, 10, 12, 0, 0).getTime();
const DAY = 24 * 60 * 60 * 1000;

function attempt(moduleId: string, overrides: Partial<MockAttempt> = {}): MockAttempt {
  return {
    id: `s_${moduleId}`, uid: "s", moduleId, testVersion: "1", attemptNumber: 1, status: "submitted",
    startedAtMs: NOW - 2 * DAY, lastSeenAtMs: NOW, answers: [], flags: [], incidents: [], keystrokes: [],
    submittedAtMs: NOW - 2 * DAY, finishReason: "submit", score: 7, correct: null, reviewReleased: true, ...overrides,
  } as MockAttempt;
}

function reminder(overrides: Partial<MockReminder>): MockReminder {
  return {
    id: "r1", studentUid: "s", message: "", deadline: null, moduleIds: [], status: "active", createdAtMs: NOW - 5 * DAY,
    createdBy: "t", editedAtMs: null, cancelledAtMs: null, seenAtMs: null, acknowledgedAtMs: null, ...overrides,
  };
}

function input(overrides: Partial<InboxInput> = {}): InboxInput {
  return {
    nowMs: NOW, approvals: [], metas: [], attempts: [], reminders: [], studentUid: "s", banks: [], assignedBankIds: [],
    practiceAnswers: [], weekCatalogIds: [], payment: null, ...overrides,
  };
}

const kinds = (items: ReturnType<typeof buildTutorInbox>) => items.map((item) => item.kind);

describe("buildTutorInbox", () => {
  it("is empty when nothing waits on the tutor", () => {
    expect(buildTutorInbox(input())).toEqual([]);
  });

  it("ranks a live test, approvals, grading, overdue tests and reviews to release", () => {
    const items = buildTutorInbox(input({
      approvals: [{ taskId: "w5-session-1", label: "Session 05", requestedAt: "2026-10-09T10:00:00Z" }],
      metas: [{ moduleId: "e06-international-trade", status: "published" }, { moduleId: "e07-capital-flows-fx-market", status: "published" }],
      attempts: [
        attempt("e01-firm-and-market-structures", { status: "active", submittedAtMs: null, score: null }),
        attempt("e02-understanding-business-cycles", { score: null }),
        attempt("e03-fiscal-policy", { reviewReleased: false }),
      ],
      reminders: [reminder({ deadline: "2026-10-08", moduleIds: ["e06-international-trade", "e07-capital-flows-fx-market"], acknowledgedAtMs: NOW })],
    }));
    expect(kinds(items)).toEqual(["live", "approval", "grade", "overdue", "release"]);
    expect(items[3]).toMatchObject({ title: "2 tests are overdue", detail: "EC6, EC7", action: { type: "remind", moduleIds: ["e06-international-trade", "e07-capital-flows-fx-market"] } });
    expect(items[4]!.action).toEqual({ type: "release-review", attemptId: "s_e03-fiscal-policy" });
  });

  it("does not call a test overdue once taken, before its deadline, or when unpublished", () => {
    const items = buildTutorInbox(input({
      metas: [{ moduleId: "e06-international-trade", status: "published" }, { moduleId: "e08-exchange-rate-calculations", status: "draft" }],
      attempts: [attempt("e06-international-trade")],
      reminders: [
        reminder({ id: "a", deadline: "2026-10-08", moduleIds: ["e06-international-trade", "e08-exchange-rate-calculations"], acknowledgedAtMs: NOW }),
        reminder({ id: "b", deadline: "2026-10-12", moduleIds: ["e07-capital-flows-fx-market"], acknowledgedAtMs: NOW }),
      ],
    }));
    expect(kinds(items)).toEqual(["draft"]);
  });

  it("suggests unlocking a practice set after a weak result with no practice since", () => {
    const base = input({
      attempts: [attempt("e03-fiscal-policy", { score: 4 })],
      banks: [{ storageId: "bank-fiscal", title: "Fiscal drills", questions: [{ moduleId: "m014-fiscal" }] }],
      assignedBankIds: [],
    });
    expect(buildTutorInbox(base)[0]).toMatchObject({
      kind: "weak", action: { type: "unlock-bank", storageId: "bank-fiscal" }, detail: 'Unlock "Fiscal drills" for repair',
    });
    // Practice on Module 014 after the test resolves it.
    expect(kinds(buildTutorInbox({ ...base, practiceAnswers: [{ moduleId: "m014-fiscal", answeredAtMs: NOW - DAY }] }))).toEqual([]);
    // Unlocked but unused: point to Practice instead of unlocking again.
    expect(buildTutorInbox({ ...base, assignedBankIds: ["bank-fiscal"] })[0]!.action).toEqual({ type: "open", section: "practice", anchor: null });
  });

  it("follows up quiet reminders and flags focus incidents and drafts", () => {
    const items = buildTutorInbox(input({
      metas: [{ moduleId: "e04-monetary-policy", status: "draft" }],
      attempts: [attempt("e05-introduction-to-geopolitics", { incidents: [{}, {}, {}] as MockAttempt["incidents"] })],
      reminders: [
        reminder({ id: "quiet", moduleIds: ["e04-monetary-policy"] }),
        reminder({ id: "fresh", createdAtMs: NOW - DAY, moduleIds: ["e04-monetary-policy"] }),
      ],
    }));
    expect(kinds(items)).toEqual(["reminder", "incidents", "draft"]);
    expect(items[0]!.title).toBe("Reminder not opened for 2+ days");
  });

  it("asks to unlock this week's locked banks and flags payments", () => {
    const items = buildTutorInbox(input({
      banks: [{ storageId: "fx", title: "FX drills", questions: [{ moduleId: "m019-fx" }] }],
      weekCatalogIds: ["cfa-2027-outline-m019"],
      payment: { currency: "SAR", monthlyAmount: 2000, paidThisMonth: 0, outstanding: 2000, outstandingCount: 1, overdueCount: 1, nextDue: "2026-10-28", state: "overdue" },
    }));
    expect(kinds(items)).toEqual(["payment", "practice-gap"]);
    expect(items[1]!.action).toEqual({ type: "unlock-bank", storageId: "fx" });
  });
});

describe("isSnoozed", () => {
  const item = buildTutorInbox(input({ metas: [{ moduleId: "e04-monetary-policy", status: "draft" }] }))[0]!;
  it("hides an item until a time, or until its situation changes", () => {
    expect(isSnoozed(item, { drafts: { untilMs: NOW + DAY } }, NOW)).toBe(true);
    expect(isSnoozed(item, { drafts: { untilMs: NOW - 1 } }, NOW)).toBe(false);
    expect(isSnoozed(item, { drafts: { version: item.version } }, NOW)).toBe(true);
    expect(isSnoozed(item, { drafts: { version: "something else" } }, NOW)).toBe(false);
    expect(isSnoozed(item, {}, NOW)).toBe(false);
  });
});
