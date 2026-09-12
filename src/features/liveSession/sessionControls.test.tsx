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
  vi.stubGlobal("HTMLElement", class HTMLElement {});
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
  it("P7 announces timer state changes, not changing seconds", async () => {
    const props = await renderRunner();
    const announcement = () => tree!.root.findAllByType("p").find(node => node.props.role === "status" && node.children[0] === "Session timer ")!.children.join("");
    const original = announcement();
    await act(async () => tree!.update(<LiveSessionRunner {...props} timer={{ ...props.timer, display: "02:29:59", elapsedMs: 1000 }} />));
    expect(announcement()).toBe(original);
    await act(async () => tree!.update(<LiveSessionRunner {...props} timer={{ ...props.timer, status: "running" }} />));
    expect(announcement()).toContain("Session timer running");
  });
  it("P7 gives every rendered runner button an accessible name", async () => {
    await renderRunner();
    const text = (node: unknown): string => typeof node === "string" || typeof node === "number" ? String(node) : node && typeof node === "object" && "children" in node ? (node as { children: unknown[] }).children.map(text).join("") : "";
    for (const button of tree!.root.findAllByType("button")) expect(button.props["aria-label"] || text(button), button.props.className).toBeTruthy();
  });
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

  it("moves between adjacent route decks with the arrow keys", async () => {
    const props = await renderRunner();
    const latestKeyHandler = () => {
      const calls = vi.mocked(window.addEventListener).mock.calls.filter(
        ([eventName]) => eventName === "keydown"
      );
      return calls.at(-1)![1] as EventListener;
    };
    const press = async (key: "ArrowLeft" | "ArrowRight") => {
      const preventDefault = vi.fn();
      await act(async () => latestKeyHandler()({
        key, target: null, repeat: false, altKey: false, ctrlKey: false,
        metaKey: false, shiftKey: false, preventDefault,
      } as unknown as KeyboardEvent));
      expect(preventDefault).toHaveBeenCalledOnce();
    };

    await press("ArrowRight");
    expect(props.onPositionChange).toHaveBeenLastCalledWith(0, 1);
    expect(tree!.root.findByType(StageCard).props.flowStep).toBe("teach");
    expect(props.onDeskCompletionChange).not.toHaveBeenCalled();

    await press("ArrowLeft");
    expect(props.onPositionChange).toHaveBeenLastCalledWith(0, 0);
    expect(props.onDeskCompletionChange).not.toHaveBeenCalled();
  });

  it("protects an unsaved evidence draft from arrow navigation", async () => {
    const props = await renderRunner();
    await act(async () => tree!.root.findByType(EvidenceRepairFlow).props.onChange({
      verdict: "parked", note: "Retain this draft", confidence: 3, errorCodes: [],
    }));
    const calls = vi.mocked(window.addEventListener).mock.calls.filter(
      ([eventName]) => eventName === "keydown"
    );
    const handler = calls.at(-1)![1] as EventListener;
    await act(async () => handler({
      key: "ArrowRight", target: null, repeat: false, altKey: false,
      ctrlKey: false, metaKey: false, shiftKey: false, preventDefault: vi.fn(),
    } as unknown as KeyboardEvent));

    expect(props.onPositionChange).toHaveBeenLastCalledWith(0, 0);
    expect(tree!.root.findAllByProps({ role: "status" }).some(node =>
      node.children.join("").includes("Save or clear the current evidence draft")
    )).toBe(true);
  });
});
