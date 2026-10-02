import type { ReactNode } from "react";
import { act, create, type ReactTestInstance } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PracticeQuestion, PracticeQuestionState } from "../lib/practiceContent";
import { createDefaultState } from "../lib/storage";

function question(id: string, moduleId: string): PracticeQuestion {
  return {
    id, moduleId, stem: "Stem", options: ["A", "B", "C"], answer: 0, explanation: "Because.",
  } as unknown as PracticeQuestion;
}

function state(questionId: string, correct: boolean): PracticeQuestionState {
  return {
    questionId, bankStorageId: "bank", attempts: 1, correctAttempts: correct ? 1 : 0, streak: correct ? 1 : 0,
    lapseCount: correct ? 0 : 1, lastCorrect: correct, lastConfidence: 3, lastAttemptedAt: new Date().toISOString(),
    dueAt: new Date(Date.now() + 86_400_000).toISOString(), intervalDays: 1, ease: 2.5, lastResponseMs: 1000,
    misconceptionTags: [],
  } as unknown as PracticeQuestionState;
}

const snapshot = vi.hoisted(() => ({ value: null as unknown }));
vi.mock("../hooks/usePracticeSnapshot", () => ({ usePracticeSnapshot: () => snapshot.value }));
vi.mock("./MockView", () => ({
  MockView: ({ moduleMockScores }: { moduleMockScores?: ReactNode }) => <div className="mock-view">{moduleMockScores}</div>,
}));
vi.mock("../lazyViews", () => ({
  ModuleMockScores: ({ uid, role }: { uid: string; role: string }) => <p className="module-mock-scores">{`${role} ${uid}`}</p>,
}));

import { ProgressView } from "./ProgressView";

function textOf(node: ReactTestInstance): string {
  return node.children.map((child) => (typeof child === "string" ? child : textOf(child))).join("");
}

async function render(role: "tutor" | "student", section: "topics" | "mocks" = "topics") {
  const handlers = { onSection: vi.fn(), onPracticeModule: vi.fn() };
  let tree!: ReturnType<typeof create>;
  await act(async () => {
    tree = create(
      <ProgressView
        section={section}
        tracker={createDefaultState()}
        updateTracker={vi.fn()}
        notify={vi.fn()}
        role={role}
        uid="uid-1"
        canEditMastery={role === "tutor"}
        canManageMocks={role === "tutor"}
        {...handlers}
      />,
    );
  });
  return { tree, handlers };
}

describe("Progress view", () => {
  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    vi.stubGlobal("requestAnimationFrame", () => 0);
    vi.stubGlobal("cancelAnimationFrame", () => undefined);
    snapshot.value = {
      status: "ready",
      studentUid: "uid-1",
      questions: [question("q1", "m001-returns"), question("q2", "m001-returns")],
      states: { q1: state("q1", true), q2: state("q2", false) },
      runs: [],
    };
  });
  afterEach(() => vi.unstubAllGlobals());

  it("renders the sections as tabs and reports a change", async () => {
    const { tree, handlers } = await render("student");
    const tabs = tree.root.findAllByProps({ role: "tab" });
    expect(tabs.map((tab) => textOf(tab))).toEqual(["Topics", "Mocks"]);
    expect(tabs.map((tab) => tab.props["aria-selected"])).toEqual([true, false]);
    expect(tabs.map((tab) => tab.props.tabIndex)).toEqual([0, -1]);
    const panel = tree.root.findByProps({ role: "tabpanel" });
    expect(panel.props["aria-labelledby"]).toBe("progress-tab-topics");
    await act(async () => tabs[1].props.onClick());
    expect(handlers.onSection).toHaveBeenCalledWith("mocks");
  });

  it("opens a module's detail and starts practice for the student", async () => {
    const { tree, handlers } = await render("student");
    const cell = tree.root.find((node) => node.type === "button" && String(node.props["aria-label"] ?? "").startsWith("M001 "));
    expect(cell.props["aria-label"]).toContain("Repair, 50% over 2 attempts");
    await act(async () => cell.props.onClick());
    const start = tree.root.find((node) => node.type === "button" && textOf(node).includes("Practise this module"));
    await act(async () => start.props.onClick());
    expect(handlers.onPracticeModule).toHaveBeenCalledWith("m001-returns");
  });

  it("gives the tutor the detail without a practice button", async () => {
    const { tree } = await render("tutor");
    const cell = tree.root.find((node) => node.type === "button" && String(node.props["aria-label"] ?? "").startsWith("M001 "));
    await act(async () => cell.props.onClick());
    expect(tree.root.findAll((node) => node.type === "button" && textOf(node).includes("Practise this module"))).toHaveLength(0);
    expect(textOf(tree.root.findByProps({ className: "heatmap-detail" }))).toContain("Returns");
  });

  it("lists the module test scores on the Mocks section", async () => {
    const { tree } = await render("student", "mocks");
    const scores = tree.root.findByProps({ className: "module-mock-scores" });
    expect(textOf(scores)).toBe("student uid-1");
    expect(textOf(tree.root.findByProps({ className: "mock-view" }))).toBe("student uid-1");
  });

  it("explains when practice evidence is unavailable", async () => {
    snapshot.value = { status: "unavailable", studentUid: null, questions: [], states: {}, runs: [] };
    const { tree } = await render("student");
    expect(textOf(tree.root.findByProps({ className: "heatmap-status" }))).toContain("Open Practice once while online");
  });
});
