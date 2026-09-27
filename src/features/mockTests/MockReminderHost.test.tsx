import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MockReminder } from "../../lib/mockReminders";

const cloud = vi.hoisted(() => ({
  listener: null as null | ((reminders: MockReminder[]) => void),
  seen: vi.fn(async (_id: string) => undefined),
  acknowledged: vi.fn(async (_id: string) => undefined),
  attempts: {} as Record<string, { status: string } | null>,
  busy: null as null | "mock" | "practice" | "session",
}));

vi.mock("../liveSession/useDialogFocus", () => ({ useDialogFocus: vi.fn() }));
vi.mock("../../lib/cloudMockReminders", () => ({
  subscribeToMyMockReminders: (_uid: string, onChange: (reminders: MockReminder[]) => void) => {
    cloud.listener = onChange;
    return () => { cloud.listener = null; };
  },
  markMockReminderSeen: (id: string) => cloud.seen(id),
  acknowledgeMockReminder: (id: string) => cloud.acknowledged(id),
}));
vi.mock("../../lib/cloudMockTests", () => ({
  getMockTestMeta: async () => ({ status: "published" }),
  getMockAttempt: async (_uid: string, id: string) => cloud.attempts[id] ?? null,
}));
vi.mock("../../lib/shellBusy", () => ({ useShellBusy: () => cloud.busy }));

const { default: MockReminderHost } = await import("./MockReminderHost");

const inDays = (days: number) => {
  const date = new Date(Date.now() + days * 86_400_000);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

function reminder(overrides: Partial<MockReminder> = {}): MockReminder {
  return {
    id: "r1",
    studentUid: "hamad",
    message: "Please complete your module mock tests as soon as possible.",
    deadline: inDays(4),
    moduleIds: ["m04-probability-trees", "m05-portfolio-mathematics"],
    status: "active",
    createdAtMs: Date.now() - 1000,
    createdBy: "tutor",
    editedAtMs: null,
    cancelledAtMs: null,
    seenAtMs: null,
    acknowledgedAtMs: null,
    ...overrides,
  };
}

let tree: ReactTestRenderer;
const onOpenModule = vi.fn();

async function mount() {
  await act(async () => { tree = create(<MockReminderHost uid="hamad" onOpenModule={onOpenModule} />); });
}
async function deliver(reminders: MockReminder[]) {
  await act(async () => { cloud.listener?.(reminders); });
  // Let the attempt lookups resolve.
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
}
const dialogs = () => tree.root.findAll(node => node.props.role === "alertdialog");
const text = () => JSON.stringify(tree.toJSON());
type Node = ReactTestRenderer["root"];
const textOf = (node: Node | string): string =>
  typeof node === "string" ? node : node.children.map(child => textOf(child as Node | string)).join("");
const button = (label: string) =>
  tree.root.findAll(node => node.type === "button" && textOf(node).includes(label))[0];

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  cloud.attempts = {};
  cloud.busy = null;
  cloud.seen.mockClear();
  cloud.acknowledged.mockClear();
  onOpenModule.mockClear();
});
afterEach(async () => {
  if (tree) await act(async () => tree.unmount());
  vi.unstubAllGlobals();
});

describe("MockReminderHost", () => {
  it("opens the reminder with the message, deadline countdown and pending modules, and marks it seen", async () => {
    await mount();
    await deliver([reminder()]);
    expect(dialogs()).toHaveLength(1);
    expect(text()).toContain("Please complete your module mock tests");
    expect(text()).toContain("4 days left");
    expect(text()).toContain("Module 4");
    expect(text()).toContain("Module 5");
    expect(cloud.seen).toHaveBeenCalledWith("r1");
  });

  it("closes only through Got it, which records the acknowledgement", async () => {
    await mount();
    await deliver([reminder()]);
    await act(async () => button("Got it").props.onClick());
    expect(cloud.acknowledged).toHaveBeenCalledWith("r1");
    expect(dialogs()).toHaveLength(0);
  });

  it("goes straight to a module's test and counts that as acknowledged", async () => {
    await mount();
    await deliver([reminder()]);
    await act(async () => button("Open").props.onClick());
    expect(onOpenModule).toHaveBeenCalledWith("m04-probability-trees");
    expect(cloud.acknowledged).toHaveBeenCalledWith("r1");
    expect(dialogs()).toHaveLength(0);
  });

  it("never opens during a timed mock test", async () => {
    cloud.busy = "mock";
    await mount();
    await deliver([reminder()]);
    expect(dialogs()).toHaveLength(0);
  });

  it("stops once every listed module is completed and lists only the ones left", async () => {
    cloud.attempts = { "m04-probability-trees": { status: "submitted" }, "m05-portfolio-mathematics": { status: "forfeited" } };
    await mount();
    await deliver([reminder()]);
    expect(dialogs()).toHaveLength(0);

    await act(async () => tree.unmount());
    cloud.attempts = { "m04-probability-trees": { status: "submitted" }, "m05-portfolio-mathematics": { status: "active" } };
    await mount();
    await deliver([reminder()]);
    expect(dialogs()).toHaveLength(1);
    expect(text()).not.toContain("Probability Trees");
    expect(text()).toContain("Return");
  });

  it("uses the urgent style inside the final 24 hours", async () => {
    await mount();
    await deliver([reminder({ deadline: inDays(0) })]);
    expect(dialogs()[0].props.className).toContain("is-urgent");
    expect(text()).toContain("Due today");
  });
});
