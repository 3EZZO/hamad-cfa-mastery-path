import { act, create, type ReactTestInstance, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MockAttempt, MockTestMeta } from "../../lib/mockTestContent";

vi.mock("../../lib/cloudMockReminders", () => ({
  sendMockReminder: vi.fn(async () => undefined),
  editMockReminder: vi.fn(async () => undefined),
  cancelMockReminder: vi.fn(async () => undefined),
}));
vi.mock("../../lib/cloud", () => ({ getCloudErrorMessage: () => "error" }));
vi.mock("../../components/AppDialog", () => ({ useAppDialog: () => ({ confirm: vi.fn(async () => true), prompt: vi.fn() }) }));

import { sendMockReminder } from "../../lib/cloudMockReminders";
import { daysFromNow } from "../../lib/reminderComposer";
import type { ReminderPreset } from "../../lib/reminderComposer";
import { MockReminderAdmin } from "./MockReminderAdmin";

function textOf(node: ReactTestInstance): string {
  return node.children.map((child) => (typeof child === "string" ? child : textOf(child))).join("");
}

const meta = (moduleId: string) => ({ moduleId, status: "published" }) as MockTestMeta;
const metas = ["e03-fiscal-policy", "e06-international-trade", "e07-capital-flows-fx-market"].map(meta);
const attempts = [{
  id: "student-1_e03-fiscal-policy", uid: "student-1", moduleId: "e03-fiscal-policy", status: "submitted", score: 7, submittedAtMs: 1000,
}] as unknown as MockAttempt[];

let tree: ReactTestRenderer | undefined;

async function render(preset: ReminderPreset | null = null, onChanged = vi.fn()) {
  await act(async () => {
    tree = create(
      <MockReminderAdmin students={[{ uid: "student-1" } as never]} metas={metas} attempts={attempts} reminders={[]} onChanged={onChanged} notify={vi.fn()} preset={preset} />,
    );
  });
  return tree!.root;
}

const chip = (root: ReactTestInstance, label: string) =>
  root.find((node) => node.type === "button" && textOf(node).trim().startsWith(label));
const message = (root: ReactTestInstance) => root.findByType("textarea").props.value as string;
const checked = (root: ReactTestInstance) =>
  root.findAll((node) => node.type === "input" && node.props.type === "checkbox" && node.props.checked).length;

describe("Smart reminder composer", () => {
  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    vi.mocked(sendMockReminder).mockClear();
  });
  afterEach(async () => {
    if (tree) await act(async () => tree!.unmount());
    tree = undefined;
    vi.unstubAllGlobals();
  });

  it("writes the message from the pending tests, deadline and recent results", async () => {
    const root = await render();
    expect(checked(root)).toBe(2);
    expect(message(root)).toBe(
      "Hi Hamad, good work on EC3 (7/8). Please complete the EC6 International Trade and EC7 Capital Flows and the FX Market tests. "
      + "Each one is 8 questions; find a quiet slot and keep your calculator ready. Thank you!",
    );
    await act(async () => chip(root, "In 3 days").props.onClick());
    expect(message(root)).toContain("(3 days left)");
    await act(async () => chip(root, "Firm").props.onClick());
    expect(message(root)).toMatch(/^Hamad, the EC6 International Trade and EC7 Capital Flows and the FX Market tests are still outstanding\./);
    expect(textOf(root.find((node) => node.props["aria-label"] === "Preview of the student's reminder"))).toContain(message(root));
  });

  it("stops rewriting once the tutor types, and can write it again", async () => {
    const root = await render();
    await act(async () => root.findByType("textarea").props.onChange({ target: { value: "My own words." } }));
    await act(async () => root.find((node) => node.type === "button" && textOf(node) === "Overdue").props.onClick());
    expect(message(root)).toBe("My own words.");
    await act(async () => chip(root, "Write it for me again").props.onClick());
    expect(message(root)).toMatch(/^Hamad, .+ now overdue/);
  });

  it("starts from a preset and sends the composed reminder", async () => {
    const onChanged = vi.fn();
    const root = await render({ moduleIds: ["e07-capital-flows-fx-market"], tone: "firm", deadline: daysFromNow(Date.now(), 2) }, onChanged);
    expect(checked(root)).toBe(1);
    await act(async () => root.find((node) => node.type === "button" && node.props.className === "button button-primary").props.onClick());
    expect(sendMockReminder).toHaveBeenCalledWith(expect.objectContaining({
      studentUid: "student-1",
      moduleIds: ["e07-capital-flows-fx-market"],
      deadline: daysFromNow(Date.now(), 2),
      message: expect.stringMatching(/^Hamad, the EC7 Capital Flows and the FX Market test is still outstanding\. Please complete it by .+ \(2 days left\)\./),
    }));
    expect(onChanged).toHaveBeenCalledTimes(1);
  });

  it("picks tests with the preset chips", async () => {
    const root = await render();
    await act(async () => chip(root, "Pending Economics").props.onClick());
    expect(checked(root)).toBe(2);
    expect(chip(root, "Overdue (0)").props.disabled).toBe(true);
  });
});
