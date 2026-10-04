import type { ComponentProps } from "react";
import { act, create, type ReactTestInstance, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MockAttempt } from "../../lib/mockTestContent";
import { formatReminderDate } from "../../lib/mockReminders";

const now = new Date(2026, 9, 1, 12, 0, 0).getTime();

function attempt(moduleId: string, overrides: Partial<MockAttempt>): MockAttempt {
  return {
    id: `student-1_${moduleId}`, uid: "student-1", moduleId, testVersion: "1", attemptNumber: 1, status: "submitted",
    startedAtMs: now - 3_600_000, lastSeenAtMs: now, answers: [], flags: [], incidents: [], keystrokes: [],
    submittedAtMs: now - 3_000_000, finishReason: "submitted", score: 7, correct: null, reviewReleased: false,
    ...overrides,
  } as MockAttempt;
}

const cloud = vi.hoisted(() => ({
  published: new Set<string>(),
  attempts: new Map<string, unknown>(),
  deadlines: new Map<string, string>(),
  practiceModuleIds: [] as string[],
}));

// The student's assigned practice sets (one question per practice module is enough here).
vi.mock("../../hooks/usePracticeSnapshot", () => ({
  usePracticeSnapshot: () => ({
    status: "ready",
    studentUid: "student-1",
    questions: cloud.practiceModuleIds.map((moduleId) => ({ id: `${moduleId}-q1`, moduleId })),
    states: {},
    runs: [],
  }),
}));

vi.mock("../../lib/cloudMockTests", () => ({
  getMockTestMeta: vi.fn(async (moduleId: string) => (cloud.published.has(moduleId) ? { moduleId, status: "published" } : null)),
  getMockAttempt: vi.fn(async (_uid: string, moduleId: string) => cloud.attempts.get(moduleId) ?? null),
  listMockAttempts: vi.fn(async () => [...cloud.attempts.values()]),
  finalizeExpiredMockAttempt: vi.fn(), finishMockAttempt: vi.fn(), getMockQuestions: vi.fn(), gradeMockAttempt: vi.fn(async (value: unknown) => value),
  loadMockTestPackage: vi.fn(), resumeMockAttempt: vi.fn(), saveMockWork: vi.fn(), startMockAttempt: vi.fn(),
}));
vi.mock("../../lib/cloud", () => ({
  getCloudErrorMessage: () => "error",
  listActiveStudentMembers: vi.fn(async () => [{ uid: "student-1" }]),
}));
vi.mock("../../lib/cloudMockReminders", () => ({
  loadMyReminderDeadlines: vi.fn(async () => cloud.deadlines),
  listMockReminders: vi.fn(async () => [...cloud.deadlines.entries()].map(([moduleId, deadline]) => ({
    studentUid: "student-1", status: "active", deadline, moduleIds: [moduleId],
  }))),
}));
vi.mock("./MockTestRunner", () => ({ MockTestRunner: () => null, requestExamFullscreen: vi.fn() }));
vi.mock("./MockResults", () => ({ MockResults: () => null }));
vi.mock("./useExamLock", () => ({ exitFullscreen: vi.fn() }));

import { ModuleMockTests } from "./ModuleMockTests";

function textOf(node: ReactTestInstance): string {
  return node.children.map((child) => (typeof child === "string" ? child : textOf(child))).join("");
}

let tree: ReactTestRenderer | undefined;

async function render(role: "student" | "tutor", handlers: Partial<ComponentProps<typeof ModuleMockTests>> = {}) {
  await act(async () => {
    tree = create(<ModuleMockTests uid={role === "tutor" ? "tutor-1" : "student-1"} role={role} notify={vi.fn()} {...handlers} />);
  });
  for (let i = 0; i < 5; i += 1) await act(async () => { await Promise.resolve(); });
  return tree!;
}

function cardTitles(root: ReactTestInstance): string[] {
  return root.findAll((node) => node.type === "li" && String(node.props.className ?? "").startsWith("mock-card"))
    .map((card) => textOf(card.findByType("h4")));
}

function doneRow(root: ReactTestInstance, title: string): ReactTestInstance {
  return root.find((node) => node.type === "li" && String(node.props.className ?? "").startsWith("mock-done__row")
    && textOf(node).includes(title));
}

function topicSection(root: ReactTestInstance, topic: string): ReactTestInstance {
  return root.find((node) => node.type === "section" && String(node.props.className ?? "").startsWith("mock-topic")
    && textOf(node.findByType("h3")) === topic);
}

function topicNames(root: ReactTestInstance): string[] {
  return root.findAll((node) => node.type === "section" && String(node.props.className ?? "").startsWith("mock-topic"))
    .map((section) => textOf(section.findByType("h3")));
}

const storage = new Map<string, string>();

describe("Module Tests priority board", () => {
  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    storage.clear();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => { storage.set(key, value); },
    });
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(now);
    cloud.published = new Set(["m01-rates-and-returns", "m02-time-value-of-money", "m03-statistical-measures", "m04-probability-trees"]);
    cloud.attempts = new Map<string, unknown>([
      ["m01-rates-and-returns", attempt("m01-rates-and-returns", { score: 4 })],
      ["m02-time-value-of-money", attempt("m02-time-value-of-money", { score: 8, reviewReleased: true })],
    ]);
    cloud.deadlines = new Map([["m04-probability-trees", "2026-10-03"]]);
    cloud.practiceModuleIds = [];
  });
  afterEach(async () => {
    if (tree) await act(async () => tree!.unmount());
    tree = undefined;
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("orders the student's tests by what needs doing and summarizes progress", async () => {
    const root = (await render("student")).root;
    expect(cardTitles(root)).toEqual([
      "Probability Trees and Conditional Expectations", // due
      "Statistical Measures of Asset Returns", // available
      "Rates and Returns", // done below 6/8: stays in view for repair
    ]);
    // A finished test with nothing left to do folds into the Done list.
    expect(textOf(doneRow(root, "The Time Value of Money in Finance"))).toContain("QM2");
    // Unpublished tests appear to the student only as a count.
    expect(textOf(root.findByProps({ className: "mock-topic__upcoming" }))).toBe("7 more tests not published yet.");
    const summary = textOf(root.findByProps({ className: "mock-hub__summary" }));
    // The date follows the device locale, so compare against the app's own formatter.
    expect(summary).toContain(`0 of 1 due by ${formatReminderDate("2026-10-03")}`);
    expect(summary).toContain("2 of 4 done overall");
  });

  it("offers repair after a weak result", async () => {
    const onOpenMistakes = vi.fn();
    const onOpenRepair = vi.fn();
    const root = (await render("student", { onOpenMistakes, onOpenRepair })).root;
    const repairs = root.findAll((node) => node.props.className === "mock-card__repair");
    expect(repairs).toHaveLength(1);
    const buttons = repairs[0].findAllByType("button");
    await act(async () => buttons[0].props.onClick());
    await act(async () => buttons[1].props.onClick());
    expect(onOpenMistakes).toHaveBeenCalledTimes(1);
    expect(onOpenRepair).toHaveBeenCalledTimes(1);
  });

  it("offers the released review on a finished test and the result on a pending one", async () => {
    const root = (await render("student")).root;
    const card = (title: string) => root.find((node) => node.type === "li"
      && String(node.props.className ?? "").startsWith("mock-card")
      && textOf(node.findByType("h4")) === title);
    const released = doneRow(root, "The Time Value of Money in Finance");
    expect(textOf(released)).toContain("Completed · 8/8");
    expect(textOf(released.findByType("button"))).toBe("Read review");
    const pending = card("Rates and Returns");
    expect(textOf(pending)).not.toContain("Review ready");
    expect(textOf(pending.findByType("button"))).toBe("View result");
  });

  it("shows the tutor the student's status, unreleased reviews and a reminder shortcut", async () => {
    const onOpenReminders = vi.fn();
    const root = (await render("tutor", { onOpenReminders })).root;
    const text = textOf(root);
    expect(text).toContain("Hamad: 4/8");
    expect(text).toContain("Review not released yet");
    expect(textOf(root.findByProps({ className: "mock-hub__summary" }))).toContain("Hamad: 0 of 1 due by");
    const remind = root.find((node) => node.type === "button" && textOf(node).includes("Send a reminder"));
    await act(async () => remind.props.onClick());
    expect(onOpenReminders).toHaveBeenCalledTimes(1);
    expect(root.findAll((node) => node.props.className === "mock-card__repair")).toHaveLength(0);
  });

  it("groups tests by topic and hides a topic with no published test from the student", async () => {
    const student = (await render("student")).root;
    expect(topicNames(student)).toEqual(["Quantitative Methods"]);
    // With a single topic there is nothing to switch between.
    expect(student.findAll((node) => node.props.className === "mock-switch")).toHaveLength(0);
    await act(async () => tree!.unmount());
    expect(topicNames((await render("tutor")).root)).toEqual(["Quantitative Methods", "Economics"]);
  });

  it("shows a published Economics test in its own group, labelled by topic", async () => {
    cloud.published.add("e08-exchange-rate-calculations");
    const root = (await render("student")).root;
    expect(topicSection(root, "Economics").findAll((node) => node.type === "li" && String(node.props.className ?? "").startsWith("mock-card"))
      .map((card) => textOf(card.findByType("h4")))[0]).toBe("Exchange Rate Calculations");
    expect(textOf(root.findByProps({ className: "mock-hub__summary" }))).toContain("2 of 5 done overall");
  });

  it("heads each topic with its progress, average and what needs attention", async () => {
    const quant = topicSection((await render("student")).root, "Quantitative Methods");
    expect(textOf(quant.findByProps({ className: "mock-topic__stats" }))).toBe("2 of 4 done · avg 6.0/8");
    const badges = quant.findByProps({ className: "mock-topic__badges" }).findAllByType("li").map(textOf);
    expect(badges).toEqual(["1 due", "1 to repair"]);
  });

  it("switches between topics and remembers the choice on this device", async () => {
    cloud.published.add("e08-exchange-rate-calculations");
    const root = (await render("student")).root;
    const option = (label: string) => root.find((node) => node.type === "button"
      && node.props.className === "mock-switch__option" && textOf(node).startsWith(label));
    expect(option("All topics").props["aria-pressed"]).toBe(true);
    expect(textOf(option("Economics"))).toBe("Economics1 to do");
    await act(async () => option("Economics").props.onClick());
    expect(topicNames(root)).toEqual(["Economics"]);
    expect(JSON.parse(storage.get("hamad-mock-hub-view")!).topic).toBe("Economics");
    await act(async () => tree!.unmount());
    expect(topicNames((await render("student")).root)).toEqual(["Economics"]);
  });

  it("folds a topic and its Done list open and closed", async () => {
    const root = (await render("student")).root;
    const quant = () => topicSection(root, "Quantitative Methods");
    const toggle = () => quant().find((node) => node.type === "button" && node.props.className === "mock-topic__toggle");
    const body = () => quant().findByProps({ className: "mock-topic__body" });
    const doneToggle = () => quant().find((node) => node.type === "button" && node.props.className === "mock-done__toggle");
    // Open by default while the topic has tests to take; the Done list starts folded.
    expect(toggle().props["aria-expanded"]).toBe(true);
    expect(body().props.hidden).toBe(false);
    expect(textOf(doneToggle())).toBe("Done (1)");
    expect(doneToggle().props["aria-expanded"]).toBe(false);
    await act(async () => doneToggle().props.onClick());
    expect(doneToggle().props["aria-expanded"]).toBe(true);
    await act(async () => toggle().props.onClick());
    expect(toggle().props["aria-expanded"]).toBe(false);
    expect(body().props.hidden).toBe(true);
  });

  it("starts a topic folded once every test in it is finished", async () => {
    cloud.published = new Set(["m02-time-value-of-money"]);
    const quant = topicSection((await render("student")).root, "Quantitative Methods");
    expect(quant.find((node) => node.type === "button" && node.props.className === "mock-topic__toggle").props["aria-expanded"]).toBe(false);
  });

  it("lists this week's tests and tags them, linking each to its test", async () => {
    cloud.published.add("e07-capital-flows-fx-market");
    const root = (await render("student", {
      thisWeek: { week: 5, moduleIds: ["e06-international-trade", "e07-capital-flows-fx-market", "e08-exchange-rate-calculations"] },
    })).root;
    const strip = root.findByProps({ className: "mock-week" });
    expect(textOf(strip)).toContain("Week 5 of the plan");
    expect(textOf(strip.findByProps({ className: "mock-week__count" }))).toBe("0 of 1 done");
    const items = strip.findAll((node) => String(node.props.className ?? "") === "mock-week__item");
    expect(items.map((item) => item.type)).toEqual(["div", "button", "div"]);
    expect(textOf(items[0])).toContain("Not published yet");
    expect(textOf(items[1])).toBe("EC7Capital Flows and the FX MarketNot started");
    const card = root.find((node) => node.type === "li" && String(node.props.className ?? "").startsWith("mock-card")
      && textOf(node.findByType("h4")) === "Capital Flows and the FX Market");
    expect(textOf(card)).toContain("This week");
    await act(async () => items[1].props.onClick());
    expect(root.findAll((node) => node.props.id === "mock-start-title")).toHaveLength(1);
  });

  it("offers the practice set for a weak test's curriculum module", async () => {
    cloud.practiceModuleIds = ["m014-fiscal-tools", "m002-return-types"];
    const onPracticeModule = vi.fn();
    const root = (await render("student", { onPracticeModule })).root;
    const repair = root.findByProps({ className: "mock-card__repair" });
    const practise = repair.find((node) => node.type === "button" && textOf(node).includes("Practise"));
    expect(textOf(practise)).toBe("Practise Rates and Returns");
    await act(async () => practise.props.onClick());
    // QM1 covers curriculum Modules 001 and 002; the assigned set for 002 is the target.
    expect(onPracticeModule).toHaveBeenCalledWith("m002-return-types");
  });

  it("keeps the repair box without a practice button when no set covers the module", async () => {
    cloud.practiceModuleIds = ["m014-fiscal-tools"];
    const root = (await render("student", { onPracticeModule: vi.fn(), onOpenMistakes: vi.fn(), onOpenRepair: vi.fn() })).root;
    const repair = root.findByProps({ className: "mock-card__repair" });
    expect(repair.findAll((node) => node.type === "button" && textOf(node).includes("Practise"))).toHaveLength(0);
    expect(repair.findAllByType("button").map(textOf)).toEqual(["Mistake Review", "Repair queue"]);
  });
});
