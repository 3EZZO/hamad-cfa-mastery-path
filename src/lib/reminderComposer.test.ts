import { describe, expect, it } from "vitest";
import type { MockReminder } from "./mockReminders";
import { bankAccuracy, bankModules, bankTopicGroups, coverageGaps, moduleRangeText, setTopicUnlocked } from "./practiceBankControls";
import type { PracticeRun } from "./practiceContent";
import { clearDeadlineChanges, composeReminderMessage, daysFromNow, moduleListText, overdueDraft, yesterday } from "./reminderComposer";

// Monday 5 October 2026, noon.
const NOW = new Date(2026, 9, 5, 12, 0, 0).getTime();

describe("composeReminderMessage", () => {
  it("names the tests, the deadline and the countdown in a friendly tone", () => {
    const message = composeReminderMessage({
      moduleIds: ["e06-international-trade"], deadline: "2026-10-08", nowMs: NOW, tone: "friendly",
      recent: [{ moduleId: "e03-fiscal-policy", score: 7 }],
    });
    expect(message).toMatch(/^Hi Hamad, good work on EC3 \(7\/8\)\. Please complete the EC6 International Trade test by .+ \(3 days left\)\./);
  });

  it("is firm about several outstanding tests, and asks for them as soon as possible without a deadline", () => {
    const message = composeReminderMessage({ moduleIds: ["e06-international-trade", "e07-capital-flows-fx-market"], deadline: null, nowMs: NOW, tone: "firm" });
    expect(message).toBe(
      "Hamad, the EC6 International Trade and EC7 Capital Flows and the FX Market tests are still outstanding. "
      + "Please complete them as soon as possible. Staying on schedule matters for the plan; tell me today if anything is in the way.",
    );
  });

  it("calls tests overdue with the date that passed", () => {
    const message = composeReminderMessage({ moduleIds: ["e06-international-trade"], deadline: "2026-10-04", nowMs: NOW, tone: "overdue" });
    expect(message).toMatch(/^Hamad, the EC6 International Trade test is now overdue \(the deadline was .+\)\. Please complete it today\./);
  });

  it("summarizes long lists by code", () => {
    expect(moduleListText(["e01-firm-and-market-structures", "e02-understanding-business-cycles", "e03-fiscal-policy", "e04-monetary-policy"]))
      .toBe("4 module tests (EC1, EC2, EC3, EC4)");
  });
});

describe("mark overdue and clear deadline", () => {
  it("dates an overdue reminder yesterday", () => {
    expect(yesterday(NOW)).toBe("2026-10-04");
    expect(yesterday(new Date(2026, 2, 1, 0, 30).getTime())).toBe("2026-02-28");
    expect(daysFromNow(NOW, 7)).toBe("2026-10-12");
    const draft = overdueDraft("s", ["e06-international-trade"], NOW);
    expect(draft).toMatchObject({ studentUid: "s", deadline: "2026-10-04", moduleIds: ["e06-international-trade"] });
    expect(draft.message).toContain("now overdue");
  });

  it("cancels reminders left empty and re-saves the others without the cleared tests", () => {
    const reminder = (id: string, moduleIds: string[], overrides: Partial<MockReminder> = {}) => ({
      id, studentUid: "s", message: `msg ${id}`, deadline: "2026-10-08", moduleIds, status: "active", createdAtMs: 0, createdBy: "t",
      editedAtMs: null, cancelledAtMs: null, seenAtMs: null, acknowledgedAtMs: null, ...overrides,
    }) as MockReminder;
    const changes = clearDeadlineChanges([
      reminder("only", ["e06-international-trade"]),
      reminder("mixed", ["e06-international-trade", "e07-capital-flows-fx-market"]),
      reminder("undated", ["e06-international-trade"], { deadline: null }),
      reminder("cancelled", ["e06-international-trade"], { status: "cancelled" }),
      reminder("other", ["e07-capital-flows-fx-market"]),
    ], "s", ["e06-international-trade"]);
    expect(changes.map((change) => [change.type, change.reminder.id])).toEqual([["cancel", "only"], ["edit", "mixed"]]);
    expect(changes[1]).toMatchObject({ draft: { message: "msg mixed", deadline: "2026-10-08", moduleIds: ["e07-capital-flows-fx-market"] } });
  });
});

describe("practice bank controls", () => {
  const banks = [
    { storageId: "a", title: "Fiscal", topic: "Economics", questions: [{ id: "q1", moduleId: "m014-fiscal" }, { id: "q2", moduleId: "m015-monetary" }] },
    { storageId: "b", title: "Trade", topic: "Economics", questions: [{ id: "q3", moduleId: "m017-trade" }] },
    { storageId: "c", title: "Rates", topic: "Quantitative Methods", questions: [{ id: "q4", moduleId: "m001-rates" }, { id: "q5", moduleId: "m003-x" }] },
  ];

  it("groups banks by topic and locks or unlocks a whole topic", () => {
    const groups = bankTopicGroups(banks, ["a", "c"]);
    expect(groups.map((group) => [group.topic, group.banks.length, group.unlocked, group.questions])).toEqual([
      ["Economics", 2, 1, 3], ["Quantitative Methods", 1, 1, 2],
    ]);
    expect(setTopicUnlocked(["a", "c"], groups[0]!.banks, true)).toEqual(["c", "a", "b"]);
    expect(setTopicUnlocked(["a", "c"], groups[0]!.banks, false)).toEqual(["c"]);
  });

  it("lists covered modules and Hamad's accuracy per bank", () => {
    expect(moduleRangeText(bankModules(banks[0]!))).toBe("Modules 14–15");
    expect(moduleRangeText(bankModules(banks[2]!))).toBe("Modules 1, 3");
    const runs = [{ answers: [{ questionId: "q1", correct: true }, { questionId: "q2", correct: false }, { questionId: "q4", correct: true }] }] as unknown as PracticeRun[];
    expect(bankAccuracy(banks[0]!, runs)).toEqual({ answered: 2, accuracy: 0.5 });
    expect(bankAccuracy(banks[1]!, runs)).toEqual({ answered: 0, accuracy: null });
  });

  it("finds modules taught so far with no bank", () => {
    // Weeks 2–3 teach modules 1–9; banks cover 1 and 3.
    expect(coverageGaps(banks, 3).map((gap) => gap.number)).toEqual([2, 4, 5, 6, 7, 8, 9]);
    expect(coverageGaps(banks, 0)).toEqual([]);
  });
});
