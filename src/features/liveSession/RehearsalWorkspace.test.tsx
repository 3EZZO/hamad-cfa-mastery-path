import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { RehearsalWorkspace } from "./RehearsalWorkspace";
import { LiveSessionRunner } from "./LiveSessionRunner";
import { EvidenceRepairFlow } from "./EvidenceRepairFlow";
import { SessionCloseout } from "./SessionCloseout";
import { StageCard } from "./StageCard";
import { adaptTutorPlaybookPackage } from "./adaptTutorPlaybook";
import { syntheticPlaybook } from "../../testFixtures/tutorPlaybooks";
import type { EvidenceVerdict } from "./types";

vi.mock("./useDialogFocus", () => ({ useDialogFocus: vi.fn() }));
let tree: ReactTestRenderer | undefined;
const writes = vi.fn();
const listeners = new Map<string, Set<(event: unknown) => void>>();
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(new Date("2026-09-12T06:00:00Z"));
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("HTMLElement", class {});
  vi.stubGlobal("localStorage", { getItem: writes, setItem: writes });
  vi.stubGlobal("window", {
    addEventListener: (name: string, fn: (event: unknown) => void) => { if (!listeners.has(name)) listeners.set(name, new Set()); listeners.get(name)!.add(fn); },
    removeEventListener: (name: string, fn: (event: unknown) => void) => listeners.get(name)?.delete(fn),
    setInterval, clearInterval, setTimeout: vi.fn(), clearTimeout, scrollTo: vi.fn(),
  });
  vi.stubGlobal("document", { hidden: false, addEventListener: vi.fn(), removeEventListener: vi.fn(), querySelector: () => null });
  writes.mockClear();
});
afterEach(async () => { if (tree) await act(async () => tree!.unmount()); tree = undefined; listeners.clear(); vi.unstubAllGlobals(); vi.useRealTimers(); });
async function setup(number: 1 | 2 = 1) {
  const playbook = adaptTutorPlaybookPackage(await syntheticPlaybook(number));
  const route = playbook.routes[0]!;
  const source = playbook.stagesByRoute[route.id]![0]!;
  playbook.stagesByRoute[route.id] = [{ ...source, questions: Array.from({ length: 5 }, (_, i) => ({ ...source.questions![0]!, id: `practice-${i}`, kind: "question" as const })) }];
  const props = { session: { id: `s${number}`, number, title: "Fixture", date: "2026-09-12", startTime: "09:00", candidateName: "Hamad", topic: "Quant" }, playbook, route, onExit: vi.fn() };
  await act(async () => { tree = create(<RehearsalWorkspace {...props} />); });
  return props;
}

describe("P5 memory-only rehearsal", () => {
  it("runs actual Next/Space, four verdicts, timer and closeout without storage writes", async () => {
    await setup();
    const runner = () => tree!.root.findByType(LiveSessionRunner);
    expect(runner().props.timer.status).toBe("running");
    const pressSpace = () => act(async () => { for (const listener of [...listeners.get("keydown") ?? []]) listener({ key: " ", code: "Space", target: null, preventDefault: vi.fn() }); });
    await pressSpace();
    const next = () => tree!.root.findAllByType("button").find(node => node.props.className === "ls-linear-control__next")!;
    expect(tree!.root.findByType(StageCard).props.flowStep).toBe("ask");
    await act(async () => next().props.onClick());
    for (const verdict of ["correct", "partial", "repair", "parked"] as EvidenceVerdict[]) {
      await act(async () => tree!.root.findByType(EvidenceRepairFlow).props.onChange({ verdict, confidence: 3, errorCodes: verdict === "repair" ? ["D"] : [], note: verdict === "parked" ? "Practice defer reason" : "Practice observation" }));
      await act(async () => tree!.root.findByType(EvidenceRepairFlow).props.onRecord());
    }
    expect(runner().props.evidence.map((item: { verdict: string }) => item.verdict)).toEqual(["correct", "partial", "repair", "parked"]);
    expect(runner().props.completedDeskIds).toHaveLength(4);
    await act(async () => { vi.advanceTimersByTime(31_000); });
    expect(runner().props.timer.elapsedMs).toBe(31_000);
    await act(async () => runner().props.onRequestCloseout());
    expect(tree!.root.findByType(SessionCloseout).props.mode).toBe("rehearsal");
    await act(async () => tree!.root.findByType(SessionCloseout).props.onBack());
    expect(runner().props.initialQuestionIndex).toBe(4);
    expect(runner().props.evidence).toHaveLength(4);
    await act(async () => runner().props.onRequestCloseout());
    for (const field of tree!.root.findAll(node => node.type === "textarea" || node.type === "input")) {
      await act(async () => field.props.onChange({ target: { value: "Practice only" } }));
    }
    await act(async () => tree!.root.findByType("form").props.onSubmit({ preventDefault: vi.fn() }));
    expect(JSON.stringify(tree!.toJSON())).toContain("Rehearsal complete");
    expect(JSON.stringify(tree!.toJSON())).not.toContain("Synced");
    await act(async () => tree!.unmount()); tree = undefined;
    expect(writes).not.toHaveBeenCalled();
  });
  it("starts each session/re-entry with empty practice data", async () => {
    const props = await setup(2);
    const runner = tree!.root.findByType(LiveSessionRunner);
    expect(runner.props.evidence).toEqual([]); expect(runner.props.initialQuestionIndex).toBe(0);
    await act(async () => tree!.unmount()); tree = undefined;
    await act(async () => { tree = create(<RehearsalWorkspace {...props} />); });
    expect(tree!.root.findByType(LiveSessionRunner).props.completedDeskIds).toEqual([]);
    expect(writes).not.toHaveBeenCalled();
  });
  it("does not accept or import persistence capabilities", () => {
    const source = readFileSync(new URL("./RehearsalWorkspace.tsx", import.meta.url), "utf8");
    expect(source).not.toMatch(/onRunChange|onComplete|onSnapshotChange|initialRun|onDiscardRehearsal|localStorage|indexedDB|firebase|tutorOffline/);
    expect(source).toContain("persistPreferences={false}");
  });
});
