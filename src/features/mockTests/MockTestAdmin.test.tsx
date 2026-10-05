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
  prompt: null as string | null,
  reminders: [] as unknown[],
  reminderProps: [] as Array<Record<string, unknown>>,
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
vi.mock("../../lib/cloudMockReminders", () => ({
  listMockReminders: vi.fn(async () => state.reminders),
  sendMockReminder: vi.fn(async () => undefined),
  editMockReminder: vi.fn(async () => undefined),
  cancelMockReminder: vi.fn(async () => undefined),
}));
const confirm = vi.fn(async () => state.confirm);
const prompt = vi.fn(async () => state.prompt);
vi.mock("../../components/AppDialog", () => ({ useAppDialog: () => ({ confirm, prompt }) }));
vi.mock("./MockReminderAdmin", () => ({
  MockReminderAdmin: (props: Record<string, unknown>) => { state.reminderProps.push(props); return null; },
}));
vi.mock("./MockAnswerKeyReview", () => ({ MockAnswerKeyReview: () => null }));

import { setMockReviewReleased, setMockTestPublished } from "../../lib/cloudMockTests";
import { cancelMockReminder, editMockReminder, sendMockReminder } from "../../lib/cloudMockReminders";
import { daysFromNow, yesterday } from "../../lib/reminderComposer";
import { MockTestAdmin } from "./MockTestAdmin";

function textOf(node: ReactTestInstance): string {
  return node.children.map((child) => (typeof child === "string" ? child : textOf(child))).join("");
}

let tree: ReactTestRenderer | undefined;

async function render(element = <MockTestAdmin notify={vi.fn()} />) {
  await act(async () => { tree = create(element); });
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
    state.reminders = [];
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

describe("Tutor Admin test controls", () => {
  const reminder = (id: string, moduleIds: string[], deadline: string) => ({
    id, studentUid: "student-1", message: `msg ${id}`, deadline, moduleIds, status: "active", createdAtMs: 0, createdBy: "t",
    editedAtMs: null, cancelledAtMs: null, seenAtMs: null, acknowledgedAtMs: null,
  });
  const row = (root: ReactTestInstance, moduleId: string) =>
    root.find((node) => node.type === "article" && node.props.id === `coach-test-${moduleId}`);

  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    state.metas = [
      meta("e03-fiscal-policy", "published"),
      meta("e06-international-trade", "published"),
      meta("e07-capital-flows-fx-market", "published"),
      meta("e08-exchange-rate-calculations", "published"),
    ];
    state.attempts = [attempt("e03-fiscal-policy")];
    state.reminders = [
      reminder("soon", ["e06-international-trade", "e07-capital-flows-fx-market"], daysFromNow(Date.now(), 3)),
      reminder("late", ["e08-exchange-rate-calculations"], "2026-01-02"),
    ];
    state.confirm = true;
    state.prompt = null;
    state.reminderProps = [];
    confirm.mockClear();
    prompt.mockClear();
    vi.mocked(sendMockReminder).mockClear();
    vi.mocked(editMockReminder).mockClear();
    vi.mocked(cancelMockReminder).mockClear();
  });
  afterEach(async () => {
    if (tree) await act(async () => tree!.unmount());
    tree = undefined;
    vi.unstubAllGlobals();
  });

  it("shows each published test's deadline state with its controls", async () => {
    const root = await render();
    const due = (moduleId: string) =>
      textOf(row(root, moduleId).find((node) => String(node.props.className).startsWith("mock-admin__due")));
    expect(due("e03-fiscal-policy")).toBe("Done · 7/8");
    expect(due("e06-international-trade")).toMatch(/^Due .+ · 3 days left$/);
    expect(due("e08-exchange-rate-calculations")).toMatch(/^Overdue · was due /);
    const labels = (moduleId: string) => row(root, moduleId).findAllByType("button").map(textOf);
    expect(labels("e03-fiscal-policy")).toEqual(["View key", "Unpublish", "Result"]);
    expect(labels("e06-international-trade")).toEqual(["View key", "Unpublish", "Remind", "Mark overdue", "Clear deadline"]);
    expect(labels("e08-exchange-rate-calculations")).toEqual(["View key", "Unpublish", "Remind", "Clear deadline"]);
  });

  it("marks a test overdue with a reminder dated yesterday", async () => {
    const root = await render();
    await act(async () => button(row(root, "e06-international-trade"), "Mark overdue").props.onClick());
    expect((confirm.mock.calls[0] as unknown as [string])[0]).toContain("Mark EC6 overdue?");
    expect(sendMockReminder).toHaveBeenCalledWith(expect.objectContaining({
      studentUid: "student-1", moduleIds: ["e06-international-trade"], deadline: yesterday(Date.now()),
    }));
  });

  it("clears a deadline by re-saving a shared reminder without the test, or cancelling it", async () => {
    const root = await render();
    await act(async () => button(row(root, "e06-international-trade"), "Clear deadline").props.onClick());
    expect(editMockReminder).toHaveBeenCalledWith("soon", expect.objectContaining({ moduleIds: ["e07-capital-flows-fx-market"], message: "msg soon" }));
    expect(cancelMockReminder).not.toHaveBeenCalled();
    await act(async () => button(row(root, "e08-exchange-rate-calculations"), "Clear deadline").props.onClick());
    expect(cancelMockReminder).toHaveBeenCalledWith("late");
  });

  it("sets one due date for a topic's pending tests", async () => {
    state.prompt = daysFromNow(Date.now(), 5);
    const root = await render();
    await act(async () => button(topicGroup(root, "Economics"), "Set a due date (3)").props.onClick());
    expect(sendMockReminder).toHaveBeenCalledWith(expect.objectContaining({
      moduleIds: ["e06-international-trade", "e07-capital-flows-fx-market", "e08-exchange-rate-calculations"],
      deadline: state.prompt,
    }));
    const sent = (vi.mocked(sendMockReminder).mock.calls[0] as unknown as [{ message: string }])[0];
    expect(sent.message).toContain("please complete the EC6 International Trade, EC7 Capital Flows and the FX Market and EC8 Exchange Rate Calculations tests");
  });

  it("rejects a past due date", async () => {
    state.prompt = "2026-01-01";
    const root = await render();
    await act(async () => button(topicGroup(root, "Economics"), "Set a due date").props.onClick());
    expect(sendMockReminder).not.toHaveBeenCalled();
    expect(textOf(root.find((node) => node.props.role === "alert"))).toContain("Enter a date from today onwards");
  });

  it("prefills the composer from a row or from Tutor Admin", async () => {
    const root = await render(<MockTestAdmin notify={vi.fn()} reminderPreset={{ moduleIds: ["e07-capital-flows-fx-market"], tone: "overdue" }} />);
    expect(state.reminderProps.at(-1)!.preset).toEqual({ moduleIds: ["e07-capital-flows-fx-market"], tone: "overdue" });
    await act(async () => button(row(root, "e06-international-trade"), "Remind").props.onClick());
    expect(state.reminderProps.at(-1)!.preset).toEqual({ moduleIds: ["e06-international-trade"], tone: "firm" });
  });
});
