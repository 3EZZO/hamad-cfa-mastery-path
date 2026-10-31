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
      pkg: { meta: { moduleId: "m01" }, questions: { questions }, key: { correct: key }, review: { items } } as unknown as LocalReview["pkg"],
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

  it("scores a 44-question paper out of 44 and shows its module breakdown with the review", async () => {
    const paperQuestions: MockQuestion[] = Array.from({ length: 44 }, (_, index) => ({
      id: `p${index + 1}`, stem: `Paper stem ${index + 1}`, table: null, figure: null, tree: null, options: ["One", "Two", "Three"],
    }));
    const paperKey = paperQuestions.map(() => 0 as const);
    const answers = paperQuestions.map((_, index) => (index < 33 ? 0 : 1));
    const local = {
      reason: "submit",
      work: { answers, flags: Array(44).fill(false), incidents: [], keystrokes: [], dwellMs: Array(44).fill(60_000) },
      correct: answers.map(answer => answer === 0),
      score: 33,
      timeUsedMs: 3_000_000,
      pkg: {
        meta: { questionCount: 44, durationSeconds: 3960 },
        questions: { questions: paperQuestions },
        key: { correct: paperKey, modules: paperQuestions.map((_, index) => (index < 40 ? "m01-rates-and-returns" : "m09-parametric-nonparametric")) },
        review: { items: paperQuestions.map(question => ({ ...items[0], id: question.id })) },
        sources: null,
      },
      saved: true,
    } as unknown as LocalReview;
    await act(async () => {
      tree = create(
        <MockResults
          moduleLabel="Full QM mock 1"
          local={local}
          onBack={vi.fn()}
          breakdown={review => <p className="breakdown-probe">{review.answers.length} answers, {review.dwellMs?.length} times</p>}
        />,
      );
    });
    const root = tree!.root;
    expect(textOf(root.findByProps({ className: "mock-score__of" }))).toBe("/ 44");
    expect(textOf(root)).toContain("75%");
    expect(textOf(root)).toContain("on your tutor account only");
    expect(textOf(root.findByProps({ className: "breakdown-probe" }))).toBe("44 answers, 44 times");
    expect(root.findByProps({ className: "mock-results__grid mock-results__grid--many" }).findAllByType("li")).toHaveLength(44);
    // The pass mark is defined for 45 questions, so a 44-question paper gets no verdict.
    expect(root.findAll((node) => typeof node.props.className === "string" && node.props.className.startsWith("mock-results__verdict"))).toHaveLength(0);
  });

  describe("a 45-question Mock Exam paper", () => {
    const paperAttempt = (score: number, reviewReleased = false) => ({
      id: "student-1_qm-paper-01", uid: "student-1", moduleId: "qm-paper-01", testVersion: "v1", attemptNumber: 1, status: "submitted",
      questionCount: 45, durationSeconds: 4050, startedAtMs: 0, lastSeenAtMs: 0,
      answers: Array(45).fill(0), flags: Array(45).fill(false), incidents: [], keystrokes: [], submittedAtMs: 1_800_000, finishReason: "submit",
      score, correct: Array.from({ length: 45 }, (_, index) => index < score), reviewReleased,
    }) as unknown as MockAttempt;
    const verdictOf = (root: ReactTestInstance) => root.find((node) => typeof node.props.className === "string" && node.props.className.startsWith("mock-results__verdict "));

    it("fails 37/45 (82.22%) with the owner's message, before the review is released", async () => {
      const root = await render({ attempt: paperAttempt(37) });
      const verdict = verdictOf(root);
      expect(verdict.props.className).toBe("mock-results__verdict is-fail");
      expect(textOf(verdict)).toBe(
        "Not passed"
        + "Sorry, you haven’t cleared this paper yet. You need at least 38 correct answers out of 45 to pass. "
        + "Review the topics you found difficult with your tutor—we’ll work through them together."
        + "Your score: 37/45 (82.22%)",
      );
      expect(textOf(root)).toContain("Pass mark84.44% (38/45)");
      expect(textOf(root)).toContain("Score82.22%");
      expect(hasClass(root, "mock-results__reveal")).toBe(true);
      expect(textOf(root)).not.toContain("Time used");
      expect(textOf(root)).not.toContain("Retry");
    });

    it.each([
      [38, "84.44"],
      [45, "100.00"],
    ])("passes %i/45 (%s%%) and awards the crest", async (score, percent) => {
      const root = await render({ attempt: paperAttempt(score, true) });
      const verdict = verdictOf(root);
      expect(verdict.props.className).toBe("mock-results__verdict is-pass");
      expect(textOf(verdict)).toBe(`PassedCongratulations! You’ve cleared this paper. Well done!Your score: ${score}/45 (${percent}%)`);
      expect(hasClass(root, "mock-results__reveal is-strong")).toBe(true);
    });

    it("gives no crest to 34–37/45, which no longer clear the bar", async () => {
      const root = await render({ attempt: paperAttempt(36) });
      expect(hasClass(root, "mock-results__reveal")).toBe(true);
      expect(hasClass(root, "mock-results__reveal is-strong")).toBe(false);
    });
  });
});
