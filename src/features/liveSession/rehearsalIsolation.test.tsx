import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LiveSessionConsole } from "./LiveSessionConsole";
import { LiveSessionRunner } from "./LiveSessionRunner";
import { RehearsalWorkspace } from "./RehearsalWorkspace";
import { SessionLaunch } from "./SessionLaunch";
import { adaptTutorPlaybookPackage } from "./adaptTutorPlaybook";
import { syntheticPlaybook } from "../../testFixtures/tutorPlaybooks";
import type { LiveSessionRunSnapshot } from "./types";
vi.mock("./LiveSessionRunner", () => ({ LiveSessionRunner: () => <div>Runner fixture</div> }));
let tree: ReactTestRenderer | undefined;
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(new Date("2026-09-12T06:20:00Z")); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("window", { addEventListener: vi.fn(), removeEventListener: vi.fn(), setInterval, clearInterval, setTimeout, clearTimeout });
  vi.stubGlobal("document", { addEventListener: vi.fn(), removeEventListener: vi.fn(), hidden: false });
});
afterEach(async () => { if (tree) await act(async () => tree!.unmount()); tree = undefined; vi.unstubAllGlobals(); vi.useRealTimers(); });
describe("P5 live/rehearsal isolation", () => {
  it("pauses the live clock once, preserves live records and discards sandbox on switch", async () => {
    const playbook = adaptTutorPlaybookPackage(await syntheticPlaybook(1));
    const changed = vi.fn(), complete = vi.fn(), discard = vi.fn();
    const initialRun: LiveSessionRunSnapshot = { phase: "running", routeId: playbook.routes[0]!.id, stageIndex: 0, questionIndex: 16, evidence: [], completedDeskIds: ["real-deck"], timer: { status: "paused", durationMs: 9_000_000, runningSince: null, elapsedBeforeRunMs: 1000, updatedAt: new Date().toISOString() }, updatedAt: new Date().toISOString() };
    const props = { session: { id: "real-session", number: 1, date: "2026-09-12", startTime: "09:00", title: "Fixture", candidateName: "Hamad", topic: "Quant" }, playbook, initialRun, onRunChange: changed, onComplete: complete, onDiscardRehearsal: discard };
    await act(async () => { tree = create(<LiveSessionConsole {...props} />); });
    const runner = () => tree!.root.findByType(LiveSessionRunner);
    await act(async () => runner().props.timer.resume());
    await act(async () => runner().props.onRehearse());
    expect(changed.mock.lastCall![0].timer.status).toBe("paused");
    const baseline = changed.mock.calls.length;
    expect(runner().props.mode).toBe("rehearsal");
    await act(async () => {
      runner().props.onEvidence({ id: "practice", targetId: "practice", stageId: "practice", verdict: "correct", confidence: 3, errorCodes: [], note: "", recordedAt: new Date().toISOString() });
      runner().props.onDeskCompletionChange("practice", true);
      runner().props.onPositionChange(0, 1);
      vi.advanceTimersByTime(60_000);
    });
    expect(changed).toHaveBeenCalledTimes(baseline); expect(complete).not.toHaveBeenCalled(); expect(discard).not.toHaveBeenCalled();
    await act(async () => tree!.root.findByType(RehearsalWorkspace).props.onExit());
    expect(runner().props.initialQuestionIndex).toBe(16);
    expect(runner().props.completedDeskIds).toEqual(["real-deck"]);
    expect(runner().props.evidence).toEqual([]); expect(runner().props.timer.status).toBe("paused");
    await act(async () => runner().props.onRehearse());
    await act(async () => tree!.update(<LiveSessionConsole {...props} active={false} />));
    expect(tree!.root.findAllByType(RehearsalWorkspace)).toHaveLength(0);
    await act(async () => tree!.update(<LiveSessionConsole {...props} active />));
    expect(runner().props.mode).not.toBe("rehearsal");
  });
  it("moves keyboard focus into the discard confirm and back to its trigger", async () => {
    const playbook = adaptTutorPlaybookPackage(await syntheticPlaybook(1));
    const closeout = { sessionId: "real-session", routeId: playbook.routes[0]!.id, actualMinutes: 30, evidence: [], mastery: [], outcome: "ok", nextAction: "", homework: "", delayedRetest: "", privateTutorNote: "", completedAt: "2026-09-12T05:00:00Z" };
    const initialRun: LiveSessionRunSnapshot = { phase: "complete", routeId: closeout.routeId, stageIndex: 0, questionIndex: 0, evidence: [], completedDeskIds: [], timer: { status: "paused", durationMs: 9_000_000, runningSince: null, elapsedBeforeRunMs: 0, updatedAt: closeout.completedAt }, updatedAt: closeout.completedAt, closeout };
    // Modeled focus: each element records focus() calls; no browser focus is claimed.
    const focused: string[] = [];
    const text = (children: unknown): string => Array.isArray(children) ? children.map(text).join("") : typeof children === "string" ? children : "";
    await act(async () => {
      tree = create(
        <LiveSessionConsole session={{ id: "real-session", number: 1, date: "2026-09-12", startTime: "09:00", title: "Fixture", candidateName: "Hamad", topic: "Quant" }} playbook={playbook} initialRun={initialRun} onComplete={vi.fn()} onDiscardRehearsal={vi.fn()} />,
        { createNodeMock: element => ({ focus: () => { focused.push(text((element.props as { children?: unknown }).children).trim()); } }) },
      );
    });
    const button = (label: string) => tree!.root.findAllByType("button").find(node => text(node.props.children).includes(label))!;
    await act(async () => button("Discard rehearsal").props.onClick());
    expect(tree!.root.findAllByProps({ role: "alertdialog" })).toHaveLength(1);
    expect(focused).toEqual(["Keep rehearsal"]);
    await act(async () => button("Keep rehearsal").props.onClick());
    expect(tree!.root.findAllByProps({ role: "alertdialog" })).toHaveLength(0);
    expect(focused).toEqual(["Keep rehearsal", "Discard rehearsal & start fresh"]);
  });
  it("can rehearse from launch without passing the live-start gate", async () => {
    const playbook = adaptTutorPlaybookPackage(await syntheticPlaybook(2));
    const complete = vi.fn();
    await act(async () => { tree = create(<LiveSessionConsole session={{ id: "s2", number: 2, date: "2026-09-19", startTime: "09:00", title: "Fixture", candidateName: "Hamad", topic: "Quant" }} playbook={playbook} onComplete={complete} />); });
    await act(async () => tree!.root.findByType(SessionLaunch).props.onRehearse(playbook.routes[0]));
    expect(tree!.root.findByType(LiveSessionRunner).props.mode).toBe("rehearsal");
    expect(complete).not.toHaveBeenCalled();
  });
});
