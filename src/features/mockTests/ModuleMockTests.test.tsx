import { act, create, type ReactTestInstance, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MockAttempt } from "../../lib/mockTestContent";

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

async function render(role: "student" | "tutor", handlers: Record<string, () => void> = {}) {
  await act(async () => {
    tree = create(<ModuleMockTests uid={role === "tutor" ? "tutor-1" : "student-1"} role={role} notify={vi.fn()} {...handlers} />);
  });
  for (let i = 0; i < 5; i += 1) await act(async () => { await Promise.resolve(); });
  return tree!;
}

function cardTitles(root: ReactTestInstance): string[] {
  return root.findAll((node) => node.type === "li" && String(node.props.className ?? "").startsWith("mock-card"))
    .map((card) => textOf(card.findByType("h3")));
}

describe("Module Tests priority board", () => {
  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(now);
    cloud.published = new Set(["m01-rates-and-returns", "m02-time-value-of-money", "m03-statistical-measures", "m04-probability-trees"]);
    cloud.attempts = new Map<string, unknown>([
      ["m01-rates-and-returns", attempt("m01-rates-and-returns", { score: 4 })],
      ["m02-time-value-of-money", attempt("m02-time-value-of-money", { score: 8, reviewReleased: true })],
    ]);
    cloud.deadlines = new Map([["m04-probability-trees", "2026-10-03"]]);
  });
  afterEach(async () => {
    if (tree) await act(async () => tree!.unmount());
    tree = undefined;
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("orders the student's tests by what needs doing and summarizes progress", async () => {
    const root = (await render("student")).root;
    expect(cardTitles(root).slice(0, 4)).toEqual([
      "Probability Trees and Conditional Expectations", // due
      "Statistical Measures of Asset Returns", // available
      "Rates and Returns", // done
      "The Time Value of Money in Finance", // done
    ]);
    const summary = textOf(root.findByProps({ className: "mock-hub__summary" }));
    expect(summary).toContain("0 of 1 due by Saturday, 3 October");
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
});
