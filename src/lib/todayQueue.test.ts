import { describe, expect, it } from "vitest";
import { getPlanTasks, PLAN } from "../data/plan";
import type { ErrorEntry, TrackerState } from "../types";
import { createDefaultState } from "./storage";
import { buildTodayQueue, TODAY_LIMITS, todayQueueMinutes } from "./todayQueue";
import { isRetestDue } from "./retests";

function mistake(overrides: Partial<ErrorEntry>): ErrorEntry {
  return {
    id: "e1", date: "2026-09-10", topic: "Quantitative Methods", category: "Concept",
    summary: "Mixed up EAR and APR", correction: "Convert first", revisitDate: "2026-09-20",
    resolved: false, ...overrides,
  };
}

/** Every required task up to and including `lastWeek` marked complete (sessions approved). */
function completeThrough(state: TrackerState, lastWeek: number): TrackerState {
  for (const week of PLAN.slice(0, lastWeek)) {
    for (const task of getPlanTasks(week)) {
      if (task.kind === "session") {
        const requestedAt = "2026-09-01T00:00:00.000Z";
        state.sessionCompletionRequests[task.id] = { taskId: task.id, requestedAt };
        state.sessionCompletionReviews[task.id] = {
          taskId: task.id, requestedAt, reviewedAt: requestedAt, status: "approved", note: "",
        };
      } else {
        state.taskCompletions[task.id] = true;
      }
    }
  }
  return state;
}

describe("isRetestDue", () => {
  it("is due only for open entries whose revisit date has arrived", () => {
    expect(isRetestDue(mistake({}), "2026-09-20")).toBe(true);
    expect(isRetestDue(mistake({}), "2026-09-19")).toBe(false);
    expect(isRetestDue(mistake({ resolved: true }), "2026-09-30")).toBe(false);
    expect(isRetestDue(mistake({ revisitDate: "" }), "2026-09-30")).toBe(false);
  });
});

describe("buildTodayQueue", () => {
  it("is empty after the exam", () => {
    expect(buildTodayQueue({ tracker: createDefaultState(), week: PLAN.length + 1, today: "2027-03-01" })).toEqual([]);
  });

  it("lists only this week's first tasks before launch has overdue work", () => {
    const items = buildTodayQueue({ tracker: createDefaultState(), week: 1, today: "2026-09-06" });
    expect(items).toHaveLength(TODAY_LIMITS.weekTasks);
    expect(items.every((item) => item.kind === "task")).toBe(true);
    expect(items[0].action).toEqual({ type: "week", week: 1 });
    expect(items[0].task?.id).toBe("w1-independent-1");
  });

  it("shows nothing from the plan before launch (week 0)", () => {
    const items = buildTodayQueue({ tracker: createDefaultState(), week: 0, today: "2026-09-01", dueReviews: 4 });
    expect(items.map((item) => item.kind)).toEqual(["review"]);
  });

  it("orders the next module test, overdue work, retests, reviews, then this week", () => {
    const tracker = completeThrough(createDefaultState(), 2);
    tracker.errorEntries = [mistake({ id: "a" }), mistake({ id: "b", revisitDate: "2026-10-30" })];
    const week3 = PLAN[2];
    const today = week3.endDate > "2026-09-27" ? "2026-09-27" : week3.endDate;
    // Week 3 is current; leave week 2's evidence gate open so it is overdue.
    delete tracker.taskCompletions["w2-evidence-gate"];
    const items = buildTodayQueue({
      tracker,
      week: 3,
      today,
      dueReviews: 14,
      pendingModuleTests: [
        { moduleId: "m02-time-value-of-money", title: "The Time Value of Money in Finance", deadline: null },
        { moduleId: "m01-rates-and-returns", title: "Rates and Returns", deadline: "2026-09-29" },
      ],
    });
    expect(items.map((item) => item.kind)).toEqual([
      "moduleTest", "overdue", "retest", "review", "task", "task", "task",
    ]);
    expect(items[0].action).toEqual({ type: "moduleTest", moduleId: "m01-rates-and-returns" });
    expect(items[0].detail).toContain("1 more test waiting");
    expect(items[1].task?.id).toBe("w2-evidence-gate");
    expect(items[1].action).toEqual({ type: "week", week: 2 });
    expect(items[2].title).toBe("1 mistake retest due");
    expect(items[3]).toMatchObject({ action: { type: "practice", intent: "review" }, minutes: 15 });
    expect(items[3].detail).toBe("Start with a set of 10");
  });

  it("leads with this week's test when no test has a deadline", () => {
    const items = buildTodayQueue({
      tracker: createDefaultState(),
      week: 5,
      today: "2026-10-05",
      pendingModuleTests: [
        { moduleId: "e01-firm-and-market-structures", title: "The Firm and Market Structures", deadline: null },
        { moduleId: "e07-capital-flows-fx-market", title: "Capital Flows and the FX Market", deadline: null },
      ],
    });
    expect(items[0]).toMatchObject({ kind: "moduleTest", action: { moduleId: "e07-capital-flows-fx-market" } });
    expect(items[0].detail).toContain("This week's topic");
  });

  it("puts a test in progress ahead of one with an earlier deadline", () => {
    const items = buildTodayQueue({
      tracker: createDefaultState(),
      week: 1,
      today: "2026-09-06",
      pendingModuleTests: [
        { moduleId: "m01-rates-and-returns", title: "Rates and Returns", deadline: "2026-09-07" },
        { moduleId: "m02-time-value-of-money", title: "The Time Value of Money in Finance", deadline: null, inProgress: true },
      ],
    });
    expect(items[0]).toMatchObject({ kind: "moduleTest", action: { moduleId: "m02-time-value-of-money" } });
    expect(items[0].detail).toContain("In progress · resume now");
  });

  it("caps overdue work and skips sessions waiting on the tutor", () => {
    // Week 1 and week 2's independent study done: week 2's session is among the oldest overdue items.
    const tracker = completeThrough(createDefaultState(), 1);
    getPlanTasks(PLAN[1]).filter((task) => task.kind === "independent")
      .forEach((task) => { tracker.taskCompletions[task.id] = true; });
    const firstSession = PLAN.flatMap((week) => getPlanTasks(week)).find((task) => task.kind === "session")!;
    tracker.sessionCompletionRequests[firstSession.id] = { taskId: firstSession.id, requestedAt: "2026-09-19T08:00:00.000Z" };
    const items = buildTodayQueue({ tracker, week: 4, today: PLAN[3].startDate });
    const overdue = items.filter((item) => item.kind === "overdue");
    expect(overdue).toHaveLength(TODAY_LIMITS.overdue);
    expect(items.some((item) => item.id === `overdue-${firstSession.id}`)).toBe(false);
    delete tracker.sessionCompletionRequests[firstSession.id];
    const withoutRequest = buildTodayQueue({ tracker, week: 4, today: PLAN[3].startDate });
    expect(withoutRequest.some((item) => item.id === `overdue-${firstSession.id}`)).toBe(true);
  });

  it("carries the plan task so the card can pick the right action", () => {
    const tracker = completeThrough(createDefaultState(), 1);
    getPlanTasks(PLAN[1]).filter((task) => task.kind === "independent")
      .forEach((task) => { tracker.taskCompletions[task.id] = true; });
    const items = buildTodayQueue({ tracker, week: 2, today: PLAN[1].startDate });
    expect(items[0].task?.kind).toBe("session");
    expect(items[0].id).toBe(`task-${items[0].task?.id}`);
  });

  it("degrades without practice or module test data", () => {
    const items = buildTodayQueue({ tracker: createDefaultState(), week: 1, today: "2026-09-06", dueReviews: null, pendingModuleTests: null });
    expect(items.some((item) => item.kind === "review" || item.kind === "moduleTest")).toBe(false);
  });
});

describe("todayQueueMinutes", () => {
  it("sums known durations and counts untimed items", () => {
    const items = buildTodayQueue({
      tracker: createDefaultState(),
      week: 1,
      today: "2026-09-06",
      dueReviews: 4,
      pendingModuleTests: [{ moduleId: "m01-rates-and-returns", title: "Rates and Returns", deadline: null }],
    });
    expect(todayQueueMinutes(items)).toEqual({ minutes: 12 + 6, untimed: TODAY_LIMITS.weekTasks });
  });
});
