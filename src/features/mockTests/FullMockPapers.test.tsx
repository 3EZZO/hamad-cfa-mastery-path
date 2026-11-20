import { act, create, type ReactTestInstance, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MockAttempt, MockTestMeta } from "../../lib/mockTestContent";

const meta = (id: string, status: "draft" | "published"): MockTestMeta => ({
  schemaVersion: 2, kind: "paper", moduleId: id, title: id, version: "v1", status,
  questionCount: 44, durationSeconds: 3960, updatedBy: "tutor", updatedAtClient: "", publishedAtClient: null,
});
const metas: Record<string, MockTestMeta | null> = {
  "qm-paper-01": meta("qm-paper-01", "published"),
  "qm-paper-02": { ...meta("qm-paper-02", "draft"), version: "paper-test-1", questionCount: 45, durationSeconds: 4050 },
  "ec-paper-01": meta("ec-paper-01", "draft"),
};
// A finished tutor rehearsal of the draft QM Paper II: 30 of 45 right, 50 minutes.
const paperTwoRehearsal = (testVersion: string, id = "r3") => ({
  id, uid: "tutor", testId: "qm-paper-02", testVersion, questionCount: 45, durationSeconds: 4050, status: "finished",
  startedAtMs: 0, updatedAtMs: 3_000_000, finishedAtMs: 3_000_000, finishReason: "submit",
  answers: Array.from({ length: 45 }, (_, index) => index % 3), flags: Array(45).fill(false), dwellMs: Array(45).fill(60_000),
  score: 30, correct: Array.from({ length: 45 }, (_, index) => index < 30),
});
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
  listMockRehearsals: vi.fn(async (id: string) => (id === "qm-paper-02"
    ? [paperTwoRehearsal("paper-test-1"), paperTwoRehearsal("paper-test-0", "r4")]
    : id === "qm-paper-01"
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

import { getMockAttempt, listMockAttempts, loadMockTestPackage, type MockTestPackage } from "../../lib/cloudMockTests";
import { parseMockTestDraft, splitMockDraft } from "../../lib/mockTestContent";
import { syntheticPaper } from "../../testFixtures/syntheticPaper";
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
    expect(cards).toHaveLength(11);
    expect(cards.map(card => textOf(card.findByProps({ className: "mock-paper__number" })))).toEqual(
      ["ETH", "QM", "QM", "EC", "FSA", "CI", "EQ", "FI", "DER", "ALT", "PM"],
    );
    expect(text).toContain("No paper yet");
    expect(text).toContain("Economics Paper");
    expect(text).toContain("Draft · version v1");
    expect(text).toContain("Hamad: 31/44");
    expect(text).not.toContain("not released");
    expect(text).toContain("Resume rehearsal");
    expect(text).toContain("40/44");
    expect(text).toContain("never appears in Hamad's results");
  });

  it("shows the pass mark and judges 45-question papers on it (44-question attempts get no verdict)", async () => {
    const paper45 = (score: number) => ({ ...studentAttempt, questionCount: 45, durationSeconds: 4050, score }) as MockAttempt;
    vi.mocked(getMockAttempt).mockResolvedValueOnce(paper45(29));
    let root = await render("student");
    expect(textOf(root)).toContain("Pass mark 84.44% (38/45)");
    expect(textOf(root)).toContain("Exam-ready from 66.67% (30/45)");
    expect(textOf(root)).toContain("29/45 · Not passed · 30:00");
    await act(async () => tree!.unmount());

    vi.mocked(getMockAttempt).mockResolvedValueOnce(paper45(37));
    root = await render("student");
    expect(textOf(root)).toContain("37/45 · Exam-ready · 30:00");
    await act(async () => tree!.unmount());

    vi.mocked(listMockAttempts).mockResolvedValueOnce([paper45(38)]);
    root = await render("tutor");
    expect(textOf(root)).toContain("Hamad: 38/45 · Passed");
    expect(textOf(root)).not.toContain("not released");
    expect(textOf(root)).not.toContain("40/44 · ");
  });

  it("keeps QM Paper II, a draft, on the tutor's side only", async () => {
    expect(mockTestTitle({ moduleId: "qm-paper-02", title: "anything" })).toBe("Quantitative Methods Paper II");
    let root = await render("student");
    expect(textOf(root)).not.toContain("Paper II");
    await act(async () => tree!.unmount());

    root = await render("tutor");
    const card = root.findAllByProps({ className: "mock-paper" }).find(node => textOf(node).includes("Quantitative Methods Paper II"))!;
    expect(textOf(card)).toContain("45 questions · 67:30 · Draft · version paper-test-1");
    expect(textOf(card)).toContain("Hamad: not available yet");
    expect(textOf(card)).toContain("Rehearse");
  });

  it("reopens the review of a finished rehearsal of the current version, and not of an older one", async () => {
    const draft = parseMockTestDraft(syntheticPaper({ moduleId: "qm-paper-02" }));
    vi.mocked(loadMockTestPackage).mockResolvedValue({ meta: metas["qm-paper-02"]!, ...splitMockDraft(draft) } as MockTestPackage);
    const root = await render("tutor");
    const card = root.findAllByProps({ className: "mock-paper" }).find(node => textOf(node).includes("Quantitative Methods Paper II"))!;
    const rows = card.findByProps({ className: "mock-paper__rehearsals" }).findAllByType("li");
    const current = rows.find(row => !textOf(row).includes("older version"))!;
    const older = rows.find(row => textOf(row).includes("older version"))!;
    expect(textOf(current)).toContain("30/45 · Exam-ready in 50:00");
    expect(older.findAllByType("button").some(button => textOf(button).includes("Open review"))).toBe(false);

    const open = current.findAllByType("button").find(button => textOf(button).includes("Open review"))!;
    await act(async () => { open.props.onClick(); });
    for (let i = 0; i < 3; i += 1) await act(async () => { await Promise.resolve(); });
    const text = textOf(tree!.root);
    expect(loadMockTestPackage).toHaveBeenCalledWith("qm-paper-02");
    expect(text).toContain("Rehearsal result · on your tutor account only");
    expect(text).toContain("Synthetic paper stem 45");
    expect(text).toContain("Exam-ready");
  });
});
