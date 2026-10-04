import { act, create, type ReactTestInstance, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MockAttempt, MockTestMeta } from "../../lib/mockTestContent";

function meta(moduleId: string, status: MockTestMeta["status"]): MockTestMeta {
  return {
    schemaVersion: 1, moduleId, title: `Test ${moduleId}`, version: "2026-10-04.1", status, questionCount: 8,
    durationSeconds: 720, updatedBy: "tutor-1", updatedAtClient: "", publishedAtClient: null,
  };
}

function attempt(moduleId: string, overrides: Partial<MockAttempt> = {}): MockAttempt {
  return {
    id: `student-1_${moduleId}`, uid: "student-1", moduleId, testVersion: "1", attemptNumber: 1, status: "submitted",
    startedAtMs: 0, lastSeenAtMs: 0, answers: [], flags: [], incidents: [], keystrokes: [], submittedAtMs: 300_000,
    finishReason: "submit", score: 7, correct: null, reviewReleased: false, ...overrides,
  } as unknown as MockAttempt;
}

const state = vi.hoisted(() => ({
  metas: [] as unknown[],
  attempts: [] as unknown[],
  lowConfidence: {} as Record<string, number>,
  confirm: true,
}));

vi.mock("../../lib/cloudMockTests", () => ({
  listMockTestMetas: vi.fn(async () => state.metas),
  listMockAttempts: vi.fn(async () => state.attempts),
  listMockAttemptHistory: vi.fn(async () => []),
  loadMockTestPackage: vi.fn(async (moduleId: string) => {
    const found = (state.metas as MockTestMeta[]).find((entry) => entry.moduleId === moduleId);
    const low = state.lowConfidence[moduleId] ?? 0;
    return found ? {
      meta: found,
      key: { correct: [0, 0, 0, 0, 0, 0, 0, 0] },
      review: { items: Array.from({ length: 8 }, (_, index) => ({ confidence: index < low ? "Medium" : "High" })) },
    } : null;
  }),
  setMockTestPublished: vi.fn(async (value: MockTestMeta, published: boolean) => ({ ...value, status: published ? "published" : "draft" })),
  setMockReviewReleased: vi.fn(async () => undefined),
  resetMockAttempt: vi.fn(), tutorGradeMockAttempt: vi.fn(), uploadMockTestDraft: vi.fn(),
}));
vi.mock("../../lib/cloud", () => ({
  getCloudErrorMessage: () => "error",
  listActiveStudentMembers: vi.fn(async () => [{ uid: "student-1" }]),
}));
const confirm = vi.fn(async () => state.confirm);
vi.mock("../../components/AppDialog", () => ({ useAppDialog: () => ({ confirm, prompt: vi.fn() }) }));
vi.mock("./MockReminderAdmin", () => ({ MockReminderAdmin: () => null }));
vi.mock("./MockAnswerKeyReview", () => ({ MockAnswerKeyReview: () => null }));

import { setMockReviewReleased, setMockTestPublished } from "../../lib/cloudMockTests";
import { MockTestAdmin } from "./MockTestAdmin";

function textOf(node: ReactTestInstance): string {
  return node.children.map((child) => (typeof child === "string" ? child : textOf(child))).join("");
}

let tree: ReactTestRenderer | undefined;

async function render() {
  await act(async () => { tree = create(<MockTestAdmin notify={vi.fn()} />); });
  for (let i = 0; i < 5; i += 1) await act(async () => { await Promise.resolve(); });
  return tree!.root;
}

const topicGroup = (root: ReactTestInstance, topic: string) =>
  root.find((node) => node.type === "details" && textOf(node.findByType("summary")).startsWith(topic));
const button = (root: ReactTestInstance, label: string) =>
  root.find((node) => node.type === "button" && textOf(node).startsWith(label));

describe("Tutor Admin module tests by topic", () => {
  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    state.metas = [
      meta("m01-rates-and-returns", "published"),
      meta("e01-firm-and-market-structures", "draft"),
      meta("e02-understanding-business-cycles", "draft"),
      meta("e03-fiscal-policy", "published"),
    ];
    state.attempts = [
      attempt("m01-rates-and-returns"),
      attempt("e03-fiscal-policy"),
      attempt("m02-time-value-of-money", { reviewReleased: true }),
    ];
    state.lowConfidence = { "e01-firm-and-market-structures": 1 };
    state.confirm = true;
    confirm.mockClear();
    vi.mocked(setMockTestPublished).mockClear();
    vi.mocked(setMockReviewReleased).mockClear();
  });
  afterEach(async () => {
    if (tree) await act(async () => tree!.unmount());
    tree = undefined;
    vi.unstubAllGlobals();
  });

  it("groups the modules by topic with upload and publish counts", async () => {
    const root = await render();
    expect(textOf(topicGroup(root, "Quantitative Methods").findByType("summary"))).toBe("Quantitative Methods1 of 11 uploaded · 1 published");
    const econ = topicGroup(root, "Economics");
    expect(textOf(econ.findByType("summary"))).toBe("Economics3 of 8 uploaded · 1 published · 2 drafts");
    expect(econ.findAll((node) => node.props.className === "mock-admin__module")).toHaveLength(8);
  });

  it("publishes every draft in a topic after one confirmation that lists them", async () => {
    const root = await render();
    await act(async () => button(topicGroup(root, "Economics"), "Publish all drafts (2)").props.onClick());
    const message = (confirm.mock.calls[0] as unknown as [string])[0];
    expect(message).toContain("Publish 2 Economics drafts");
    expect(message).toContain("EC1 The Firm and Market Structures (version 2026-10-04.1, 1 answer below High confidence)");
    expect(message).toContain("EC2 Understanding Business Cycles (version 2026-10-04.1)");
    expect(vi.mocked(setMockTestPublished).mock.calls.map(([value, published]) => [value.moduleId, published])).toEqual([
      ["e01-firm-and-market-structures", true],
      ["e02-understanding-business-cycles", true],
    ]);
  });

  it("publishes nothing when the confirmation is declined", async () => {
    state.confirm = false;
    const root = await render();
    await act(async () => button(topicGroup(root, "Economics"), "Publish all drafts").props.onClick());
    expect(setMockTestPublished).not.toHaveBeenCalled();
  });

  it("releases the reviews of graded, unreleased attempts in one topic only", async () => {
    const root = await render();
    expect(button(topicGroup(root, "Quantitative Methods"), "Release all reviews").props.disabled).toBe(false);
    await act(async () => button(topicGroup(root, "Economics"), "Release all reviews (1)").props.onClick());
    expect((confirm.mock.calls[0] as unknown as [string])[0]).toContain("(EC3)");
    expect(setMockReviewReleased).toHaveBeenCalledTimes(1);
    expect(setMockReviewReleased).toHaveBeenCalledWith("student-1_e03-fiscal-policy", true);
  });

  it("filters the results table by topic under topic headings", async () => {
    const root = await render();
    const table = () => root.findByProps({ className: "mock-table mock-admin__results" });
    const headings = () => table().findAll((node) => node.props.className === "mock-admin__topic-row").map(textOf);
    expect(headings()).toEqual(["Quantitative Methods", "Economics"]);
    await act(async () => button(root, "Economics").props.onClick());
    expect(headings()).toEqual(["Economics"]);
    const modules = table().findByType("tbody").findAll((node) => node.type === "tr" && node.props.className === undefined)
      .map((row) => textOf(row.findAllByType("td")[0]));
    expect(modules).toEqual(["Economics · Module 1", "Economics · Module 2", "Economics · Module 3"]);
  });
});
