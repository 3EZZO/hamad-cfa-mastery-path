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
    { moduleId: "e03-fiscal-policy", status: "submitted", score: 7, reviewReleased: false },
  ] as TutorConsoleData["attempts"],
  reminders: [
    { id: "r1", status: "active", acknowledgedAtMs: null, moduleIds: ["e06-international-trade"], deadline: "2026-10-08" },
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

async function render(section: TutorSection, onSection = vi.fn(), onOpenPayments = vi.fn()) {
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
    expect(tabs.map(textOf)).toEqual(["Overview", "Tests2", "Practice", "Sessions", "Records"]);
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

  it("still renders when the console data is unavailable", async () => {
    consoleState.data = { ...loaded, metas: null, attempts: null, reminders: null, banks: null, assignedBankIds: null, payments: null };
    const root = await render("overview");
    expect(textOf(root)).toContain("Payments are not set up yet.");
  });
});
