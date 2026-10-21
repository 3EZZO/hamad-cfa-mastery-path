import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { ComponentProps } from "react";
import { QuickCheck } from "./QuickCheck";
import { quickCheckPool } from "./quickCheckModel";
import type { PracticeQuestion } from "../../lib/practiceContent";

vi.mock("../liveSession/useDialogFocus", () => ({ useDialogFocus: vi.fn() }));
let tree: ReactTestRenderer;
const question: PracticeQuestion = {
  id: "portfolio", moduleId: "m008-portfolio", conceptId: "portfolio-return", type: "calculation", difficulty: 3,
  estimatedSeconds: 90, prompt: "What is the weighted portfolio return?", options: ["6%", "8%", "10%"], correctOption: 1,
  explanation: "Use the weighted mean.", working: ["0.4 × 5% + 0.6 × 10% = 8%"], formulae: ["Rp = sum(wi Ri)"],
  distractorExplanations: ["", "", ""], examTrap: "Check weights.", tags: [],
};
const pool = quickCheckPool([{ storageId: "synthetic", title: "Synthetic", topic: "Quantitative Methods", questions: [question] }], { title: "Portfolio Mathematics", topic: "Quantitative Methods" });
const props = (): ComponentProps<typeof QuickCheck> => ({ active: true, modal: false, pdfLabel: "Reading 05 · Portfolio Mathematics", loading: false, error: "", pool: pool.items, scope: pool.scope, moduleNumbers: pool.moduleNumbers, results: [], onResult: vi.fn(), onRetry: vi.fn(), onClose: vi.fn() });
const text = () => JSON.stringify(tree.toJSON());
beforeEach(() => vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true));
afterEach(() => { if (tree) act(() => tree.unmount()); vi.unstubAllGlobals(); });

it("labels the PDF separately from curriculum modules and records each answer once", () => {
  const input = props();
  act(() => { tree = create(<QuickCheck {...input} />); });
  expect(text()).toContain("Reading 05 · Portfolio Mathematics");
  expect(text()).toContain("Curriculum module 8");
  expect(tree.root.findByProps({ className: "tm-check" }).props.role).toBe("region");
  const options = tree.root.findByProps({ className: "tm-check__options" }).findAllByType("button");
  act(() => options[1].props.onClick());
  expect(input.onResult).toHaveBeenCalledExactlyOnceWith({ key: "synthetic:portfolio", chosen: 1, correct: true });
  expect(options.every(option => option.props.disabled)).toBe(true);
  expect(text()).toContain("Use the weighted mean.");
  const next = tree.root.findAllByType("button").find(button => button.children.includes("Another question"))!;
  act(() => next.props.onClick());
  expect(text()).not.toContain("Use the weighted mean.");
  expect(input.onResult).toHaveBeenCalledTimes(1);
});

it("drops stale questions and answers when the available reading pool changes", () => {
  const input = props();
  act(() => { tree = create(<QuickCheck {...input} />); });
  act(() => tree.root.findByProps({ className: "tm-check__options" }).findAllByType("button")[0].props.onClick());
  act(() => tree.update(<QuickCheck {...input} pdfLabel="Fiscal Policy" pool={[]} scope="reading" moduleNumbers={[14]} />));
  expect(text()).toContain("No matching questions available yet");
  expect(text()).not.toContain(question.prompt);
  expect(text()).not.toContain("Use the weighted mean.");
  expect(text()).toContain("Fiscal Policy");
});

it("keeps close and retry available for loading, failed and unmapped banks", () => {
  const input = props();
  act(() => { tree = create(<QuickCheck {...input} loading />); });
  expect(text()).toContain("Loading the question bank");
  act(() => tree.update(<QuickCheck {...input} error="Bank unavailable" />));
  const retry = tree.root.findAllByType("button").find(button => button.children.some(child => typeof child === "string" && child.includes("Try again")))!;
  act(() => retry.props.onClick());
  expect(input.onRetry).toHaveBeenCalledTimes(1);
  act(() => tree.update(<QuickCheck {...input} pool={[]} scope="none" moduleNumbers={[]} modal />));
  expect(text()).toContain("This PDF needs a curriculum match");
  expect(tree.root.findByProps({ className: "tm-check" }).props["aria-modal"]).toBe(true);
  const event = { key: "Escape", preventDefault: vi.fn(), stopPropagation: vi.fn() };
  act(() => tree.root.findByProps({ className: "tm-check" }).props.onKeyDownCapture(event));
  expect(input.onClose).toHaveBeenCalledTimes(1);
  expect(event.stopPropagation).toHaveBeenCalled();
});
