import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LiveSessionRunner, type LiveSessionRunnerProps } from "./LiveSessionRunner";
import { StageCard } from "./StageCard";
import { EvidenceRepairFlow } from "./EvidenceRepairFlow";
import { ReferenceDrawer } from "./ReferenceDrawer";
import { adaptTutorPlaybookPackage } from "./adaptTutorPlaybook";
import { syntheticPlaybook } from "../../testFixtures/tutorPlaybooks";

vi.mock("./useDialogFocus", () => ({ useDialogFocus: vi.fn() }));
let tree: ReactTestRenderer | undefined;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("window", {
    addEventListener: vi.fn(), removeEventListener: vi.fn(), scrollTo: vi.fn(),
    setTimeout: vi.fn(), setInterval, clearInterval,
  });
  vi.stubGlobal("document", {
    addEventListener: vi.fn(), removeEventListener: vi.fn(),
  });
});
afterEach(async () => {
  if (tree) await act(async () => tree!.unmount());
  tree = undefined;
  vi.unstubAllGlobals();
});

async function renderRunner() {
  const book = adaptTutorPlaybookPackage(await syntheticPlaybook(1));
  const route = book.routes[0]!;
  const first = book.stagesByRoute[route.id]![0]!;
  const props: LiveSessionRunnerProps = {
    session: { id: "fixture", number: 1, date: "2026-09-12", startTime: "09:00", title: "Fixture session", candidateName: "Fixture", topic: "Quant" },
    route,
    stages: [first, { ...first, id: "second-stage", title: "Second stage" }],
    references: [], evidence: [], completedDeskIds: [],
    timer: {
      snapshot: { status: "paused", durationMs: 9_000_000, elapsedBeforeRunMs: 0, runningSince: null, updatedAt: "2026-09-12T06:00:00Z" },
      status: "paused", elapsedMs: 0, remainingMs: 9_000_000, overtimeMs: 0,
      progress: 0, expired: false, display: "02:30:00",
      start: vi.fn(), pause: vi.fn(), resume: vi.fn(), toggle: vi.fn(), finish: vi.fn(), reset: vi.fn(),
    },
    onEvidence: vi.fn(), onDeskCompletionChange: vi.fn(),
    onPositionChange: vi.fn(), onRequestCloseout: vi.fn(),
    onRehearse: vi.fn(),
    sessionTools: <button type="button">Existing playbook controls</button>,
  };
  await act(async () => { tree = create(<LiveSessionRunner {...props} />); });
  return props;
}

describe("P1 consolidated session controls", () => {
  it("P5 prevents rehearsal entry from discarding an unrecorded evidence draft", async () => {
    const props = await renderRunner();
    const button = () => tree!.root.findAllByType("button").find(node => node.children.includes("Rehearse without saving"))!;
    expect(button().props.disabled).toBe(false);
    await act(async () => tree!.root.findByType(EvidenceRepairFlow).props.onChange({ verdict: "parked", note: "Unsaved note", confidence: 3, errorCodes: [] }));
    expect(button().props.disabled).toBe(true);
    await act(async () => button().props.onClick());
    expect(props.onRehearse).not.toHaveBeenCalled();
  });
  it("keeps stages and existing workspace actions in a single closed tools panel", async () => {
    await renderRunner();
    const tools = tree!.root.find(node => node.type === "details" && node.props.className === "ls-deck-tools");
    expect(tools.props.open).toBeUndefined();
    expect(tools.findAll(node => node.type === "nav" && node.props["aria-label"] === "Session stages")).toHaveLength(1);
    expect(tools.findAllByType("button").some(button => button.children.includes("Existing playbook controls"))).toBe(true);
    const header = tree!.root.find(node => node.type === "header" && node.props.className === "ls-livebar");
    expect(header.findAll(node => node.type === "nav")).toHaveLength(0);
  });

  it("still navigates to a selected stage and retains the three teaching panels", async () => {
    const props = await renderRunner();
    const jump = tree!.root.findAllByType("button").find(button => button.props["aria-label"]?.startsWith("Stage 2:"))!;
    await act(async () => jump.props.onClick());
    expect(props.onPositionChange).toHaveBeenLastCalledWith(1, 0);
    expect(tree!.root.findByType(StageCard).props.stage.title).toBe("Second stage");
    expect(tree!.root.findAll(node => node.props.className === "ls-panel-step")).toHaveLength(3);
  });

  it("retains the direct References action and the unchanged Next sequence", async () => {
    const props = await renderRunner();
    const next = () => tree!.root.findAllByType("button").find(button => button.props.className === "ls-linear-control__next")!;
    await act(async () => next().props.onClick());
    expect(tree!.root.findByType(StageCard).props.flowStep).toBe("ask");
    await act(async () => next().props.onClick());
    expect(tree!.root.findByType(StageCard).props.flowStep).toBe("answer");
    expect(props.onEvidence).not.toHaveBeenCalled();
    const references = tree!.root.findAllByType("button").find(button => button.props.className?.includes("ls-reference-shortcut"))!;
    await act(async () => references.props.onClick());
    expect(tree!.root.findByType(ReferenceDrawer).props.open).toBe(true);
  });
});
