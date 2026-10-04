import { act, create, type ReactTestInstance, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MockAttempt, MockQuestion, MockReviewItem } from "../../lib/mockTestContent";
import type { LocalReview, ReviewPractice } from "./MockResults";

const questions: MockQuestion[] = Array.from({ length: 8 }, (_, index) => ({
  id: `q${index + 1}`, stem: `Stem ${index + 1}`, table: null, options: ["One", "Two", "Three"],
}));
const items = questions.map((question) => ({
  id: question.id, concept: "Concept", explanation: "Because.", working: [], keystrokes: "",
  distractors: ["a", "b", "c"], confidence: "high", sourceFiles: [], sourceRef: "",
})) as unknown as MockReviewItem[];
const key = questions.map(() => 0);

vi.mock("../../lib/cloudMockTests", () => ({
  getMockQuestions: vi.fn(async () => ({ questions })),
  getMockAnswerKey: vi.fn(async () => key),
  getMockReview: vi.fn(async () => ({ items })),
  gradeMockAttempt: vi.fn(async (value: unknown) => value),
}));
vi.mock("../../lib/cloud", () => ({ getCloudErrorMessage: () => "error" }));
vi.mock("../../components/Crest", () => ({ Crest: () => null }));

import { getMockQuestions } from "../../lib/cloudMockTests";
import { MockResults } from "./MockResults";

function textOf(node: ReactTestInstance): string {
  return node.children.map((child) => (typeof child === "string" ? child : textOf(child))).join("");
}

function attempt(reviewReleased: boolean): MockAttempt {
  return {
    id: "student-1_m01", uid: "student-1", moduleId: "m01", testVersion: "1", attemptNumber: 1, status: "submitted",
    startedAtMs: 0, lastSeenAtMs: 0, answers: [0, 1, 0, 0, 2, 0, 0, null], flags: [false, true, false, false, false, false, false, false],
    incidents: [], keystrokes: [], submittedAtMs: 300_000, finishReason: "submit", score: 5,
    correct: [true, false, true, true, false, true, true, false], reviewReleased,
  } as unknown as MockAttempt;
}

let tree: ReactTestRenderer | undefined;

async function render(props: { attempt?: MockAttempt; local?: LocalReview; practice?: ReviewPractice }) {
  await act(async () => {
    tree = create(<MockResults moduleLabel="Module 1" onBack={vi.fn()} {...props} />);
  });
  for (let i = 0; i < 3; i += 1) await act(async () => { await Promise.resolve(); });
  return tree!.root;
}

const hasClass = (root: ReactTestInstance, className: string) =>
  root.findAll((node) => node.props.className === className).length > 0;

describe("Module test results", () => {
  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    vi.mocked(getMockQuestions).mockClear();
  });
  afterEach(async () => {
    if (tree) await act(async () => tree!.unmount());
    tree = undefined;
    vi.unstubAllGlobals();
  });

  it("shows the student only the final score before the review is released", async () => {
    const root = await render({ attempt: attempt(false) });
    const text = textOf(root);
    expect(textOf(root.findByProps({ className: "mock-score__value" }))).toBe("5");
    expect(text).toContain("63%");
    expect(text).not.toContain("Time used");
    expect(text).not.toContain("You chose");
    expect(hasClass(root, "mock-results__grid")).toBe(false);
    expect(hasClass(root, "mock-review")).toBe(false);
    expect(hasClass(root, "mock-results__pending")).toBe(true);
    expect(getMockQuestions).not.toHaveBeenCalled();
  });

  it("shows the question grid and explanations once the review is released", async () => {
    const root = await render({ attempt: attempt(true) });
    expect(textOf(root)).toContain("Time used");
    expect(root.findByProps({ className: "mock-results__grid" }).findAllByType("li")).toHaveLength(8);
    expect(textOf(root.findByProps({ className: "mock-review" }))).toContain("Stem 1");
    expect(hasClass(root, "mock-results__pending")).toBe(false);
  });

  it("shows a tutor rehearsal in full straight away", async () => {
    const local: LocalReview = {
      reason: "submit",
      work: { answers: attempt(false).answers, flags: attempt(false).flags } as LocalReview["work"],
      correct: attempt(false).correct!,
      score: 5,
      timeUsedMs: 300_000,
      pkg: { questions: { questions }, key: { correct: key }, review: { items } } as unknown as LocalReview["pkg"],
    };
    const root = await render({ local });
    expect(hasClass(root, "mock-results__grid")).toBe(true);
    expect(hasClass(root, "mock-review")).toBe(true);
  });

  const articles = (root: ReactTestInstance) => root.findAll((node) => node.type === "article");
  const button = (root: ReactTestInstance, label: string) =>
    root.find((node) => node.type === "button" && textOf(node).startsWith(label));

  it("filters the explanations to the mistakes, counting an unanswered question", async () => {
    const root = await render({ attempt: attempt(true) });
    expect(articles(root)).toHaveLength(8);
    const only = button(root, "Only my mistakes");
    expect(textOf(only)).toBe("Only my mistakes 3");
    await act(async () => only.props.onClick());
    expect(articles(root).map((article) => article.props.id)).toEqual(["mock-review-q2", "mock-review-q5", "mock-review-q8"]);
    await act(async () => button(root, "All questions").props.onClick());
    expect(articles(root)).toHaveLength(8);
  });

  it("jumps from the grid to a question's explanation, showing it if the filter hides it", async () => {
    const target = { scrollIntoView: vi.fn(), focus: vi.fn() };
    const getElementById = vi.fn(() => target);
    vi.stubGlobal("document", { getElementById });
    const root = await render({ attempt: attempt(true) });
    const jumps = root.findAll((node) => node.props.className === "mock-results__jump");
    await act(async () => jumps[1].props.onClick());
    expect(getElementById).toHaveBeenLastCalledWith("mock-review-q2");
    expect(target.scrollIntoView).toHaveBeenCalledTimes(1);
    expect(target.focus).toHaveBeenCalledWith({ preventScroll: true });
    await act(async () => button(root, "Only my mistakes").props.onClick());
    await act(async () => jumps[0].props.onClick()); // Q1 was right, so the filter hides it
    expect(articles(root)).toHaveLength(8);
    expect(getElementById).toHaveBeenLastCalledWith("mock-review-q1");
  });

  it("links the mistakes to the practice set for this module", async () => {
    const onPractise = vi.fn();
    const root = await render({
      attempt: attempt(true),
      practice: { moduleTitle: "Fiscal Policy", practiceModuleId: "m014-fiscal-tools", onPractise },
    });
    const panel = root.findByProps({ className: "mock-practice" });
    expect(textOf(panel)).toContain("3 to repair.");
    await act(async () => button(panel, "Practise Fiscal Policy").props.onClick());
    expect(onPractise).toHaveBeenCalledWith("m014-fiscal-tools");
    // One link on each wrong answer as well.
    expect(root.findAll((node) => node.props.className === "mock-review__practice")).toHaveLength(3);
  });

  it("falls back to Mistake Review and the repair queue when no practice set covers the module", async () => {
    const onOpenMistakes = vi.fn();
    const onOpenRepair = vi.fn();
    const root = await render({
      attempt: attempt(true),
      practice: { moduleTitle: "Fiscal Policy", practiceModuleId: null, onPractise: vi.fn(), onOpenMistakes, onOpenRepair },
    });
    const panel = root.findByProps({ className: "mock-practice" });
    expect(textOf(panel)).toContain("No practice set for Fiscal Policy yet.");
    await act(async () => button(panel, "Mistake Review").props.onClick());
    await act(async () => button(panel, "Repair queue").props.onClick());
    expect(onOpenMistakes).toHaveBeenCalledTimes(1);
    expect(onOpenRepair).toHaveBeenCalledTimes(1);
    expect(root.findAll((node) => node.props.className === "mock-review__practice")).toHaveLength(0);
  });

  it("shows no practice links in a tutor rehearsal or before the review is released", async () => {
    const practice: ReviewPractice = { moduleTitle: "Fiscal Policy", practiceModuleId: "m014-fiscal-tools", onPractise: vi.fn() };
    const root = await render({ attempt: attempt(false), practice });
    expect(root.findAll((node) => node.props.className === "mock-practice")).toHaveLength(0);
  });
});
