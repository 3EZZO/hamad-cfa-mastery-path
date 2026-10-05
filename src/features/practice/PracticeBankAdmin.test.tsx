import { act, create, type ReactTestInstance, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PracticeRun } from "../../lib/practiceContent";

const state = vi.hoisted(() => ({ assigned: ["a"] as string[] }));

vi.mock("../../lib/cloud", () => ({
  listPublishedPracticeBanks: vi.fn(async () => [
    { storageId: "a", title: "Fiscal drills", topic: "Economics", version: "1", questions: [{ id: "q1", moduleId: "m014-fiscal" }, { id: "q2", moduleId: "m015-monetary" }] },
    { storageId: "b", title: "Trade drills", topic: "Economics", version: "1", questions: [{ id: "q3", moduleId: "m017-trade" }] },
    { storageId: "c", title: "Rates", topic: "Quantitative Methods", version: "1", questions: [{ id: "q4", moduleId: "m001-rates" }] },
  ]),
  loadPracticeAssignment: vi.fn(async () => ({ bankStorageIds: state.assigned })),
  publishPracticeBank: vi.fn(),
  savePracticeAssignment: vi.fn(async () => undefined),
}));

import { savePracticeAssignment } from "../../lib/cloud";
import { PracticeBankAdmin } from "./PracticeBankAdmin";

function textOf(node: ReactTestInstance): string {
  return node.children.map((child) => (typeof child === "string" ? child : textOf(child))).join("");
}

let tree: ReactTestRenderer | undefined;

async function render(runs: PracticeRun[] | null = null) {
  await act(async () => { tree = create(<PracticeBankAdmin notify={vi.fn()} runs={runs} />); });
  for (let i = 0; i < 3; i += 1) await act(async () => { await Promise.resolve(); });
  return tree!.root;
}

const group = (root: ReactTestInstance, topic: string) =>
  root.find((node) => node.type === "section" && node.props["data-fold-id"] === `practice:topic-${topic}`);
const bulk = (root: ReactTestInstance, topic: string) =>
  group(root, topic).find((node) => node.type === "button" && /^(Unlock|Lock) all$/.test(textOf(node)));

describe("Practice bank controls", () => {
  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    state.assigned = ["a"];
    vi.mocked(savePracticeAssignment).mockClear();
  });
  afterEach(async () => {
    if (tree) await act(async () => tree!.unmount());
    tree = undefined;
    vi.unstubAllGlobals();
  });

  it("groups banks by topic with covered modules and Hamad's accuracy", async () => {
    const runs = [{ answers: [{ questionId: "q1", correct: true }, { questionId: "q2", correct: true }, { questionId: "q2", correct: false }, { questionId: "q2", correct: true }] }] as unknown as PracticeRun[];
    const root = await render(runs);
    const econ = group(root, "Economics");
    expect(textOf(econ.find((node) => node.props.className === "coach-fold__meta"))).toBe("2 banks · 3 questions · 1 unlocked");
    const fiscal = econ.findAllByType("article")[0]!;
    expect(textOf(fiscal)).toContain("Modules 14–15 · 2 questions");
    expect(textOf(fiscal)).toContain("Hamad: 75% of 4 answered");
    expect(textOf(econ.findAllByType("article")[1]!)).toContain("not practised yet");
  });

  it("unlocks or locks every bank of a topic at once", async () => {
    const root = await render();
    await act(async () => bulk(root, "Economics").props.onClick());
    expect(savePracticeAssignment).toHaveBeenCalledWith(["a", "b"]);
    expect(textOf(bulk(root, "Economics"))).toBe("Lock all");
    await act(async () => bulk(root, "Economics").props.onClick());
    expect(savePracticeAssignment).toHaveBeenLastCalledWith([]);
  });
});
