import { act, create, type ReactTestInstance, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MockAttempt, MockQuestion, MockReviewItem } from "../../lib/mockTestContent";
import type { LocalReview } from "./MockResults";

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

async function render(props: { attempt?: MockAttempt; local?: LocalReview }) {
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
});
