import { act, create, type ReactTestInstance, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDefaultState } from "../lib/storage";
import type { TutorConsoleData } from "../hooks/useTutorConsole";

const consoleState = vi.hoisted(() => ({ data: null as unknown }));

vi.mock("../hooks/useTutorConsole", () => ({
  useTutorConsole: () => ({ ...(consoleState.data as object), refresh: vi.fn() }),
}));
vi.mock("../lazyViews", () => ({
  MockTestAdmin: () => <p className="stub-tests">Module test admin</p>,
  PracticeBankAdmin: () => <p className="stub-practice">Practice bank admin</p>,
}));
vi.mock("../components/TutorBrief", () => ({ TutorBriefPanel: () => <p className="stub-brief">Brief</p> }));
const cloudMocks = vi.hoisted(() => ({ setMockReviewReleased: vi.fn(async () => undefined), tutorGradeMockAttempt: vi.fn() }));
vi.mock("../lib/cloudMockTests", () => cloudMocks);
vi.mock("../components/AppDialog", () => ({
  useAppDialog: () => ({ confirm: vi.fn(async () => true), prompt: vi.fn(async () => ""), active: () => true }),
}));

import { TutorAdminView } from "./TutorAdminView";
import type { TutorSection } from "../lib/tutorConsole";

function textOf(node: ReactTestInstance): string {
  return node.children.map((child) => (typeof child === "string" ? child : textOf(child))).join("");
}

const loaded: TutorConsoleData = {
  loading: false,
  studentUid: "student-1",
  metas: [
    { moduleId: "e03-fiscal-policy", status: "published" },
    { moduleId: "e04-monetary-policy", status: "draft" },
  ] as TutorConsoleData["metas"],
  attempts: [
    { id: "s_e03-fiscal-policy", moduleId: "e03-fiscal-policy", status: "submitted", score: 7, reviewReleased: false, incidents: [], submittedAtMs: Date.now() - 60_000, startedAtMs: Date.now() - 600_000 },
  ] as unknown as TutorConsoleData["attempts"],
  history: [],
  runs: [],
  reminders: [
    {
      id: "r1", studentUid: "student-1", status: "active", acknowledgedAtMs: null, seenAtMs: null, editedAtMs: null, cancelledAtMs: null,
      createdAtMs: Date.now() - 3 * 24 * 60 * 60 * 1000, moduleIds: ["e06-international-trade"], deadline: "2999-10-08",
    },
  ] as TutorConsoleData["reminders"],
  banks: [{ storageId: "bank-1", title: "Fiscal drills", topic: "Economics", questions: [1, 2, 3] }] as unknown as TutorConsoleData["banks"],
  assignedBankIds: [],
  payments: {
    config: {
      studentUid: "student-1", studentName: "Hamad", tutorName: "Mohamed", monthlyAmount: 2000, currency: "SAR",
      engagementStartDate: "2026-09-01", engagementEndDate: "2027-02-28", billingDayOfMonth: 28,
    },
    records: [{ id: "p1", studentUid: "student-1", dateRecorded: "2026-08-01", amount: 2000, status: "overdue", hasReceipt: false }],
  },
};

let tree: ReactTestRenderer | undefined;

async function render(section: TutorSection, onSection = vi.fn(), onOpenPayments = vi.fn(), onOpenSessionMode = vi.fn()) {
  await act(async () => {
    tree = create(
      <TutorAdminView
        tracker={createDefaultState()}
        updateTracker={vi.fn()}
        replaceTrackerAuthoritatively={vi.fn(async () => undefined)}
        authoritativeReplaceBusy={false}
        syncStatus="synced"
        notify={vi.fn()}
        section={section}
        onSection={onSection}
        onOpenPayments={onOpenPayments}
        onOpenSessionMode={onOpenSessionMode}
      />,
    );
  });
  return tree!.root;
}

describe("Tutor Admin control centre", () => {
  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    consoleState.data = loaded;
  });
  afterEach(async () => {
    if (tree) await act(async () => tree!.unmount());
    tree = undefined;
    vi.unstubAllGlobals();
  });

  it("shows the sections as tabs with counts of what is waiting", async () => {
    const root = await render("overview");
    const tabs = root.findAll((node) => node.type === "button" && node.props.role === "tab");
    // Inbox: release a review, follow up a quiet reminder, an overdue payment, a draft.
    expect(tabs.map(textOf)).toEqual(["Overview4", "Tests2", "Practice", "Sessions", "Activity", "Records"]);
    // One draft plus one review to release.
    const badge = tabs[1]!.findByType("em");
    expect(badge.props["aria-label"]).toBe("2 waiting");
  });

  it("summarizes tests, reminders, practice, sessions and payments on the overview", async () => {
    const onSection = vi.fn();
    const onOpenPayments = vi.fn();
    const root = await render("overview", onSection, onOpenPayments);
    const tile = (title: string) => root.find((node) => node.type === "article" && String(node.props.className).startsWith("coach-tile")
      && textOf(node.findByType("h4")) === title);
    expect(textOf(tile("Module tests"))).toContain("1 published · 1 draft");
    expect(textOf(tile("Module tests"))).toContain("1 review to release");
    expect(textOf(tile("Reminders"))).toContain("1 not yet acknowledged");
    expect(textOf(tile("Practice"))).toContain("0 of 1 banks unlocked");
    expect(textOf(tile("Payments"))).toContain("1 open (SAR 2,000), 1 overdue");
    expect(tile("Payments").props.className).toContain("is-attention");
    await act(async () => tile("Practice").findByProps({ className: "coach-tile__action" }).props.onClick());
    expect(onSection).toHaveBeenCalledWith("practice");
    await act(async () => tile("Payments").findByProps({ className: "coach-tile__action" }).props.onClick());
    expect(onOpenPayments).toHaveBeenCalledTimes(1);
    expect(root.findAll((node) => node.props.className === "stub-brief")).toHaveLength(1);
  });

  it("renders only the chosen section", async () => {
    let root = await render("tests");
    expect(root.findAll((node) => node.props.className === "stub-tests")).toHaveLength(1);
    expect(root.findAll((node) => node.props.className === "stub-practice")).toHaveLength(0);
    await act(async () => tree!.unmount());
    root = await render("records");
    expect(textOf(root)).toContain("Export, then reset all shared progress");
    expect(textOf(root)).not.toContain("Session completion queue");
  });

  it("finds a test from the quick-find box and jumps to its section", async () => {
    const onSection = vi.fn();
    const root = await render("overview", onSection);
    const input = root.findByType("input");
    await act(async () => input.props.onChange({ target: { value: "monetary" } }));
    const options = root.findAll((node) => node.props.role === "option");
    expect(textOf(options[0]!)).toContain("EC4 Monetary Policy");
    expect(textOf(options[0]!)).toContain("Draft");
    await act(async () => options[0]!.findByType("button").props.onClick());
    expect(onSection).toHaveBeenCalledWith("tests");
    expect(root.findByType("input").props.value).toBe("");
  });

  it("lists the action inbox, runs an action and hides an item", async () => {
    const root = await render("overview");
    const items = () => root.findAll((node) => node.type === "li" && String(node.props.className).startsWith("coach-inbox__item"));
    expect(items().map((item) => textOf(item.findByType("strong")))).toEqual([
      "Release the review of EC3 Fiscal Policy",
      "A payment is overdue",
      "Reminder not opened for 2+ days",
      "1 draft to review and publish",
    ]);
    await act(async () => items()[0]!.findByProps({ className: "button button-primary" }).props.onClick());
    expect(cloudMocks.setMockReviewReleased).toHaveBeenCalledWith("s_e03-fiscal-policy", true);
    const hide = items()[3]!.findAll((node) => node.type === "button" && node.props.title === "Hide until it changes")[0]!;
    await act(async () => hide.props.onClick());
    expect(items()).toHaveLength(3);
    expect(textOf(root)).toContain("Show 1 hidden");
  });

  it("shows student insights on the overview", async () => {
    const root = await render("overview");
    const insights = root.find((node) => node.type === "section" && node.props["data-fold-id"] === "overview:insights");
    expect(textOf(insights)).toContain("Plan tests taken");
    expect(textOf(insights)).toContain("Exam");
    // EC3 scored 7/8: listed, not weak.
    expect(textOf(insights)).toContain("EC3 7/8");
    expect(insights.findAll((node) => node.type === "tr" && node.props.className === "is-weak")).toHaveLength(0);
  });

  it("prepares the next session with a copyable agenda and Session Mode", async () => {
    const writeText = vi.fn(async () => undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    const onOpenSessionMode = vi.fn();
    const root = await render("sessions", vi.fn(), vi.fn(), onOpenSessionMode);
    const prep = root.find((node) => node.type === "section" && node.props["data-fold-id"] === "sessions:prep");
    expect(textOf(prep.findByType("h3"))).toMatch(/^Session \d{2} · /);
    const button = (label: string) => prep.find((node) => node.type === "button" && textOf(node).includes(label));
    await act(async () => button("Copy agenda").props.onClick());
    expect(writeText).toHaveBeenCalledTimes(1);
    expect((writeText.mock.calls[0] as unknown as [string])[0]).toMatch(/^Session \d{2} · /);
    await act(async () => button("Open Session Mode").props.onClick());
    expect(onOpenSessionMode).toHaveBeenCalledTimes(1);
  });

  it("shows the activity feed", async () => {
    const root = await render("activity");
    expect(textOf(root)).toContain("Submitted EC3 Fiscal Policy");
    expect(textOf(root)).toContain("7/8");
    expect(textOf(root)).toContain("Reminder sent");
  });

  it("still renders when the console data is unavailable", async () => {
    consoleState.data = { ...loaded, metas: null, attempts: null, history: null, runs: null, reminders: null, banks: null, assignedBankIds: null, payments: null };
    const root = await render("overview");
    expect(textOf(root)).toContain("Payments are not set up yet.");
  });
});
