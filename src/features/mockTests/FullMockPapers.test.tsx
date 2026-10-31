import { act, create, type ReactTestInstance, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MockAttempt, MockTestMeta } from "../../lib/mockTestContent";

const meta = (id: string, status: "draft" | "published"): MockTestMeta => ({
  schemaVersion: 2, kind: "paper", moduleId: id, title: id, version: "v1", status,
  questionCount: 44, durationSeconds: 3960, updatedBy: "tutor", updatedAtClient: "", publishedAtClient: null,
});
const metas: Record<string, MockTestMeta | null> = {
  "qm-paper-01": meta("qm-paper-01", "published"),
  "ec-paper-01": meta("ec-paper-01", "draft"),
};
const studentAttempt = {
  id: "student-1_qm-paper-01", uid: "student-1", moduleId: "qm-paper-01", testVersion: "v1", attemptNumber: 1,
  status: "submitted", questionCount: 44, durationSeconds: 3960, startedAtMs: 0, lastSeenAtMs: 0,
  answers: Array(44).fill(0), flags: Array(44).fill(false), dwellMs: Array(44).fill(0), incidents: [], keystrokes: [],
  submittedAtMs: 1_800_000, finishReason: "submit", score: 31, correct: Array(44).fill(true), reviewReleased: false,
} as unknown as MockAttempt;

vi.mock("../../lib/cloudMockTests", () => ({
  getMockTestMeta: vi.fn(async (id: string) => metas[id] ?? null),
  getMockAttempt: vi.fn(async () => null),
  listMockAttempts: vi.fn(async () => [studentAttempt]),
  finalizeExpiredMockAttempt: vi.fn(),
  finishMockAttempt: vi.fn(),
  getMockKeyDoc: vi.fn(),
  getMockQuestions: vi.fn(),
  gradeMockAttempt: vi.fn(async (value: unknown) => value),
  loadMockTestPackage: vi.fn(),
  resumeMockAttempt: vi.fn(),
  saveMockWork: vi.fn(),
  startMockAttempt: vi.fn(),
  watchMockAttempt: vi.fn(() => () => undefined),
}));
vi.mock("../../lib/cloudMockRehearsals", () => ({
  listMockRehearsals: vi.fn(async (id: string) => (id === "qm-paper-01"
    ? [{ id: "r1", uid: "tutor", testId: id, testVersion: "v1", questionCount: 44, durationSeconds: 3960, status: "finished", startedAtMs: 0, updatedAtMs: 0, finishedAtMs: 3_000_000, finishReason: "submit", answers: [], flags: [], dwellMs: [], score: 40, correct: [] },
      { id: "r2", uid: "tutor", testId: id, testVersion: "v1", questionCount: 44, durationSeconds: 3960, status: "active", startedAtMs: Date.now(), updatedAtMs: 0, finishedAtMs: null, finishReason: null, answers: [], flags: [], dwellMs: [], score: null, correct: null }]
    : [])),
  discardMockRehearsal: vi.fn(),
  finishMockRehearsal: vi.fn(),
  mockRehearsalRemainingMs: vi.fn(() => 1000),
  saveMockRehearsal: vi.fn(),
  startMockRehearsal: vi.fn(),
}));
vi.mock("../../lib/cloud", () => ({
  getCloudErrorMessage: () => "error",
  listActiveStudentMembers: vi.fn(async () => [{ uid: "student-1" }]),
}));

import { getMockAttempt } from "../../lib/cloudMockTests";
import { FullMockPapers } from "./FullMockPapers";
import { mockTestTitle } from "../../data/mockPapers";

function textOf(node: ReactTestInstance): string {
  return node.children.map((child) => (typeof child === "string" ? child : textOf(child))).join("");
}

let tree: ReactTestRenderer | undefined;

async function render(role: "student" | "tutor") {
  await act(async () => {
    tree = create(<FullMockPapers uid={role === "tutor" ? "tutor" : "student-1"} role={role} notify={vi.fn()} onFocusChange={vi.fn()} />);
  });
  for (let i = 0; i < 4; i += 1) await act(async () => { await Promise.resolve(); });
  return tree!.root;
}

describe("Full QM mocks section", () => {
  beforeEach(() => vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true));
  afterEach(async () => {
    if (tree) await act(async () => tree!.unmount());
    tree = undefined;
    vi.unstubAllGlobals();
  });

  it("shows the student only published papers, with the paper rules", async () => {
    const root = await render("student");
    const text = textOf(root);
    expect(root.findAllByProps({ className: "mock-paper" })).toHaveLength(1);
    expect(text).toContain("44 questions");
    expect(text).toContain("66:00");
    expect(text).not.toContain("Rehearse");
    expect(text).toContain("Open");
    expect(textOf(root.findByProps({ id: "mock-papers-title" }))).toBe("Mock Exams");
    expect(text).toContain("Quantitative Methods Paper");
    expect(textOf(root.findByProps({ className: "mock-paper__number" }))).toBe("QM");
  });

  it("shows a paper's registry name even when the upload carried an older title", () => {
    expect(mockTestTitle({ moduleId: "qm-paper-01", title: "Full QM mock 1" })).toBe("Quantitative Methods Paper");
    expect(mockTestTitle({ moduleId: "m01-rates-and-returns", title: "Module 1 test" })).toBe("Module 1 test");
  });

  it("shows the student's completed score and time", async () => {
    vi.mocked(getMockAttempt).mockResolvedValueOnce(studentAttempt);
    const root = await render("student");
    expect(textOf(root)).toContain("31/44 · 30:00");
  });

  it("gives the tutor every paper, Hamad's status and saved, resumable rehearsals", async () => {
    const root = await render("tutor");
    const text = textOf(root);
    // One card per CFA topic for the tutor, in curriculum order.
    const cards = root.findAllByProps({ className: "mock-paper" });
    expect(cards).toHaveLength(10);
    expect(cards.map(card => textOf(card.findByProps({ className: "mock-paper__number" })))).toEqual(
      ["ETH", "QM", "EC", "FSA", "CI", "EQ", "FI", "DER", "ALT", "PM"],
    );
    expect(text).toContain("No paper yet");
    expect(text).toContain("Economics Paper");
    expect(text).toContain("Draft · version v1");
    expect(text).toContain("Hamad: 31/44 · review not released");
    expect(text).toContain("Resume rehearsal");
    expect(text).toContain("40/44");
    expect(text).toContain("never appears in Hamad's results");
  });
});
