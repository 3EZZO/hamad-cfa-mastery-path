import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LiveSessionRunner, type LiveSessionRunnerProps } from "./LiveSessionRunner";
import { CandidatePromptView } from "./CandidatePromptView";
import { EvidenceRepairFlow } from "./EvidenceRepairFlow";
import { ReferenceDrawer } from "./ReferenceDrawer";
import { StageCard } from "./StageCard";
import { adaptTutorPlaybookPackage } from "./adaptTutorPlaybook";
import { syntheticPlaybook } from "../../testFixtures/tutorPlaybooks";

/**
 * Guided ⇄ PDF switching keeps the guided runner mounted with its draft,
 * route and position, while a hidden runner registers no global shortcut,
 * runs no desk timer and shows no candidate/reference dialog.
 * (DOM-model test: real keyboard focus is covered by browser QA.)
 */
vi.mock("./useDialogFocus", () => ({ useDialogFocus: vi.fn() }));
let tree: ReactTestRenderer | undefined;
const windowListeners = new Map<string, Set<EventListener>>();

beforeEach(() => {
  windowListeners.clear();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("HTMLElement", class HTMLElement {});
  vi.stubGlobal("window", {
    addEventListener: (name: string, fn: EventListener) => { if (!windowListeners.has(name)) windowListeners.set(name, new Set()); windowListeners.get(name)!.add(fn); },
    removeEventListener: (name: string, fn: EventListener) => { windowListeners.get(name)?.delete(fn); },
    scrollTo: vi.fn(), setTimeout: vi.fn(), setInterval, clearInterval,
  });
  vi.stubGlobal("document", { addEventListener: vi.fn(), removeEventListener: vi.fn() });
});
afterEach(async () => {
  if (tree) await act(async () => tree!.unmount());
  tree = undefined;
  vi.unstubAllGlobals();
});

async function render() {
  const book = adaptTutorPlaybookPackage(await syntheticPlaybook(1));
  const route = book.routes[0]!;
  const stages = book.stagesByRoute[route.id]!;
  const props: LiveSessionRunnerProps = {
    session: { id: "fixture", number: 1, date: "2026-09-12", startTime: "09:00", title: "Fixture", candidateName: "Fixture", topic: "Quant" },
    route, stages, references: [], evidence: [], completedDeskIds: [],
    timer: {
      snapshot: { status: "running", durationMs: 9_000_000, elapsedBeforeRunMs: 0, runningSince: "2026-09-12T06:00:00Z", updatedAt: "2026-09-12T06:00:00Z" },
      status: "running", elapsedMs: 0, remainingMs: 9_000_000, overtimeMs: 0, progress: 0, expired: false, display: "02:30:00",
      start: vi.fn(), pause: vi.fn(), resume: vi.fn(), toggle: vi.fn(), finish: vi.fn(), reset: vi.fn(), current: vi.fn(), replace: vi.fn(),
    },
    onEvidence: vi.fn(), onDeskCompletionChange: vi.fn(), onPositionChange: vi.fn(), onRequestCloseout: vi.fn(),
  };
  await act(async () => { tree = create(<LiveSessionRunner {...props} />); });
  return props;
}

const keydownCount = () => windowListeners.get("keydown")?.size ?? 0;

describe("guided surface gating while Teach from PDF is visible", () => {
  it("keeps the draft and position but removes the global shortcut listener", async () => {
    const props = await render();
    expect(keydownCount()).toBe(1);
    const draft = { verdict: "partial" as const, note: "Unsaved tutor draft", confidence: 2, errorCodes: [] };
    await act(async () => tree!.root.findByType(EvidenceRepairFlow).props.onChange(draft));
    const jump = tree!.root.findAllByType("button").find(button => button.props["aria-label"]?.startsWith("Stage 2:"));
    if (jump) await act(async () => jump.props.onClick());
    const stageTitle = tree!.root.findByType(StageCard).props.stage.title;

    await act(async () => tree!.update(<LiveSessionRunner {...props} surfaceActive={false} />));
    expect(keydownCount()).toBe(0);
    // An arrow key now cannot reach the hidden deck: no handler exists.
    expect(tree!.root.findByType(EvidenceRepairFlow).props.value).toEqual(draft);

    await act(async () => tree!.update(<LiveSessionRunner {...props} surfaceActive />));
    expect(keydownCount()).toBe(1);
    expect(tree!.root.findByType(EvidenceRepairFlow).props.value).toEqual(draft);
    expect(tree!.root.findByType(StageCard).props.stage.title).toBe(stageTitle);
    // Teach, Ask and Answer remain together after returning.
    expect(tree!.root.findAll(node => node.props.className === "ls-panel-step")).toHaveLength(3);
  });

  it("hides an open candidate or reference dialog while hidden and restores it on return", async () => {
    const props = await render();
    await act(async () => tree!.root.findByType(StageCard).props.onShowCandidate());
    const references = tree!.root.findAllByType("button").find(button => button.props.className?.includes("ls-reference-shortcut"))!;
    await act(async () => references.props.onClick());
    expect(tree!.root.findByType(ReferenceDrawer).props.open).toBe(true);

    await act(async () => tree!.update(<LiveSessionRunner {...props} surfaceActive={false} />));
    expect(tree!.root.findByType(CandidatePromptView).props.open).toBe(false);
    expect(tree!.root.findByType(ReferenceDrawer).props.open).toBe(false);

    await act(async () => tree!.update(<LiveSessionRunner {...props} surfaceActive />));
    expect(tree!.root.findByType(ReferenceDrawer).props.open).toBe(true);
  });

  it("does not report focus mode to the hub while hidden", async () => {
    const props = await render();
    const focus = tree!.root.findAllByType("button").find(button => button.props["aria-label"] === "Enter laptop focus mode")!;
    await act(async () => focus.props.onClick());
    const runner = () => tree!.root.find(node => node.props.className === "ls-runner");
    expect(runner().props["data-focus"]).toBe("true");
    await act(async () => tree!.update(<LiveSessionRunner {...props} surfaceActive={false} />));
    expect(runner().props["data-focus"]).toBe("false");
  });
});
