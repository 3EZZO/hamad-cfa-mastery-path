import { act, create, type ReactTestInstance, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MockAttempt } from "../../lib/mockTestContent";

function attempt(moduleId: string, score: number, at: number): MockAttempt {
  return {
    id: `student-1_${moduleId}`, uid: "student-1", moduleId, testVersion: "1", attemptNumber: 1, status: "submitted",
    startedAtMs: at - 400_000, lastSeenAtMs: at, answers: [], flags: [], incidents: [], keystrokes: [],
    submittedAtMs: at, finishReason: "submit", score, correct: null, reviewReleased: false,
  } as unknown as MockAttempt;
}

const attempts = vi.hoisted(() => ({ list: [] as unknown[] }));

vi.mock("../../lib/cloudMockTests", () => ({
  getMockAttempt: vi.fn(async (_uid: string, moduleId: string) =>
    attempts.list.find((entry) => (entry as MockAttempt).moduleId === moduleId) ?? null),
  listMockAttempts: vi.fn(async () => attempts.list),
}));

import { ModuleMockScores } from "./ModuleMockScores";

function textOf(node: ReactTestInstance): string {
  return node.children.map((child) => (typeof child === "string" ? child : textOf(child))).join("");
}

let tree: ReactTestRenderer | undefined;

describe("Module mock scores", () => {
  beforeEach(() => vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true));
  afterEach(async () => {
    if (tree) await act(async () => tree!.unmount());
    tree = undefined;
    vi.unstubAllGlobals();
  });

  it("shows each topic's average and latest scores above the module rows", async () => {
    attempts.list = [
      attempt("m01-rates-and-returns", 4, 1_000),
      attempt("m02-time-value-of-money", 8, 2_000),
      attempt("e03-fiscal-policy", 7, 3_000),
    ];
    await act(async () => { tree = create(<ModuleMockScores uid="student-1" role="student" />); });
    for (let i = 0; i < 3; i += 1) await act(async () => { await Promise.resolve(); });
    const trends = tree!.root.findAll((node) => node.type === "section" && node.props.className === "mock-trend");
    expect(trends.map((trend) => textOf(trend.findByProps({ className: "mock-trend__head" })))).toEqual([
      "Quantitative Methodsavg 6.0/8 · 2 graded",
      "Economicsavg 7.0/8 · 1 graded",
    ]);
    const quantScores = trends[0].findByType("ol").findAllByType("li");
    expect(quantScores.map((item) => textOf(item))).toEqual(["4/8QM1", "8/8QM2"]);
    expect(quantScores[0].props.className).toBe("is-weak");
  });
});
