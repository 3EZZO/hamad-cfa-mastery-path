import { describe, expect, it } from "vitest";
import type { PaymentConfig, PaymentRecord } from "./cloudPayments";
import { buildConsoleEntries, consoleGlance, parseTutorSection, searchConsole, sectionCounts, summarizePayments, type ConsoleEntry } from "./tutorConsole";

const config: PaymentConfig = {
  studentUid: "s", studentName: "Hamad", tutorName: "Mohamed", monthlyAmount: 2000, currency: "SAR",
  engagementStartDate: "2026-09-01", engagementEndDate: "2027-02-28", billingDayOfMonth: 31,
};

function record(id: string, dateRecorded: string, amount: number, status: PaymentRecord["status"]): PaymentRecord {
  return { id, studentUid: "s", dateRecorded, amount, status, hasReceipt: false };
}

describe("parseTutorSection", () => {
  it("falls back to the overview for unknown segments", () => {
    expect(parseTutorSection("tests")).toBe("tests");
    expect(parseTutorSection("")).toBe("overview");
    expect(parseTutorSection("payments")).toBe("overview");
  });
});

describe("summarizePayments", () => {
  it("reports this month's payments, open records and the next billing day", () => {
    const summary = summarizePayments(config, [
      record("a", "2026-09-30", 2000, "paid"),
      record("b", "2026-10-03", 1500, "paid"),
      record("c", "2026-10-04", 500, "pending"),
    ], new Date(2026, 9, 5));
    expect(summary).toMatchObject({ paidThisMonth: 1500, outstanding: 500, outstandingCount: 1, overdueCount: 0, nextDue: "2026-10-31", state: "due" });
  });

  it("clamps the billing day to short months and rolls over once it has passed", () => {
    expect(summarizePayments({ ...config, billingDayOfMonth: 31 }, [], new Date(2026, 10, 5)).nextDue).toBe("2026-11-30");
    expect(summarizePayments({ ...config, billingDayOfMonth: 3 }, [], new Date(2026, 9, 5)).nextDue).toBe("2026-11-03");
  });

  it("flags overdue records and a fully paid month", () => {
    expect(summarizePayments(config, [record("x", "2026-08-31", 2000, "overdue")], new Date(2026, 9, 5)).state).toBe("overdue");
    expect(summarizePayments(config, [record("y", "2026-10-01", 2000, "paid")], new Date(2026, 9, 5)).state).toBe("paid");
  });
});

describe("searchConsole", () => {
  const entries: ConsoleEntry[] = [
    { id: "t1", kind: "test", label: "EC3 Fiscal Policy", detail: "Economics · Published", section: "tests", anchor: "coach-test-e03", keywords: ["economics"] },
    { id: "t2", kind: "test", label: "QM8 Hypothesis Testing", detail: "Quant · Draft", section: "tests", anchor: null, keywords: [] },
    { id: "b1", kind: "bank", label: "Fiscal policy drills", detail: "Economics · 40 questions", section: "practice", anchor: null, keywords: [] },
    { id: "s1", kind: "session", label: "Session 05", detail: "10 Oct · Economics II", section: "sessions", anchor: null, keywords: [] },
  ];

  it("matches every word, best label match first", () => {
    expect(searchConsole(entries, "fiscal").map((entry) => entry.id)).toEqual(["b1", "t1"]);
    expect(searchConsole(entries, "fiscal econ").map((entry) => entry.id)).toEqual(["b1", "t1"]);
    expect(searchConsole(entries, "draft").map((entry) => entry.id)).toEqual(["t2"]);
    expect(searchConsole(entries, "session 05")[0]!.id).toBe("s1");
  });

  it("returns nothing for an empty or unmatched query", () => {
    expect(searchConsole(entries, "  ")).toEqual([]);
    expect(searchConsole(entries, "derivatives")).toEqual([]);
  });
});

describe("consoleGlance", () => {
  it("counts what waits on the tutor and feeds the tab badges", () => {
    const glance = consoleGlance({
      metas: [{ moduleId: "a", status: "published" }, { moduleId: "b", status: "published" }, { moduleId: "c", status: "draft" }],
      attempts: [
        { moduleId: "a", status: "submitted", score: 6, reviewReleased: false },
        { moduleId: "b", status: "submitted", score: null, reviewReleased: false },
        { moduleId: "d", status: "active", score: null, reviewReleased: false },
        { moduleId: "e", status: "forfeited", score: 0, reviewReleased: true },
      ],
      reminders: [{ status: "active", acknowledgedAtMs: null }, { status: "active", acknowledgedAtMs: 5 }, { status: "cancelled", acknowledgedAtMs: null }],
      banks: [{ storageId: "x", questions: [1, 2, 3] }, { storageId: "y", questions: [1] }],
      assignedBankIds: ["y"],
      approvals: 2,
    });
    expect(glance).toEqual({
      tests: { published: 2, drafts: 1, toRelease: 1, toGrade: 1, done: 3 },
      practice: { banks: 2, unlocked: 1, questions: 4 },
      reminders: { active: 2, unacknowledged: 1 },
      approvals: 2,
    });
    expect(sectionCounts(glance)).toEqual({ tests: 3, sessions: 2 });
  });

  it("treats data that has not loaded as empty", () => {
    expect(consoleGlance({ metas: null, attempts: null, reminders: null, banks: null, assignedBankIds: null, approvals: 0 }).tests.done).toBe(0);
  });
});

describe("buildConsoleEntries", () => {
  it("indexes sections, tests, banks, sessions and reminders with their target section and row", () => {
    const entries = buildConsoleEntries({
      tests: [{ id: "e03-fiscal-policy", code: "EC3", title: "Fiscal Policy", topic: "Economics", status: null }],
      banks: [{ storageId: "bank-1", title: "Fiscal drills", topic: "Economics", questions: 40, unlocked: false }],
      sessions: [{ number: 5, title: "Weekly checkpoint", dateLabel: "10 Oct" }],
      reminders: [{ id: "r1", codes: ["EC6", "EC7"], deadline: "2026-10-08" }],
    });
    expect(entries.find((entry) => entry.id === "test-e03-fiscal-policy")).toMatchObject({
      label: "EC3 Fiscal Policy", detail: "Economics · Not uploaded", section: "tests", anchor: "coach-test-e03-fiscal-policy",
    });
    expect(entries.find((entry) => entry.kind === "bank")).toMatchObject({ detail: "Economics · 40 questions · Locked", section: "practice" });
    expect(searchConsole(entries, "s5")[0]!.id).toBe("session-5");
    expect(searchConsole(entries, "ec7")[0]!.label).toBe("Reminder: EC6, EC7");
    expect(entries.filter((entry) => entry.kind === "section")).toHaveLength(6);
  });
});
