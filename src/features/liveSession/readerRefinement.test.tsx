import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { SessionReadingContext } from "./SessionReadingContext";
import { TeachingLibrary } from "./TeachingLibrary";
import { StageCard } from "./StageCard";
import { adaptTutorPlaybookPackage } from "./adaptTutorPlaybook";
import { syntheticPlaybook } from "../../testFixtures/tutorPlaybooks";
vi.mock("./useDialogFocus", () => ({ useDialogFocus: vi.fn() }));
vi.mock("react-dom", () => ({ createPortal: (node: unknown) => node }));
let tree: ReactTestRenderer | undefined;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("document", { body: {} });
  vi.stubGlobal("window", { matchMedia: () => ({ matches: true }), setTimeout: vi.fn() });
});
afterEach(async () => { if (tree) await act(async () => tree!.unmount()); tree = undefined; vi.unstubAllGlobals(); });

describe("P6 proportional and responsive reading", () => {
  it("passes all three reader sizes across the library portal", async () => {
    const book = adaptTutorPlaybookPackage(await syntheticPlaybook(1));
    for (const size of [1, 1.1, 1.2]) {
      await act(async () => { tree = create(<SessionReadingContext.Provider value={size}><TeachingLibrary stages={book.libraryStages!} /></SessionReadingContext.Provider>); });
      await act(async () => tree!.root.findByType("button").props.onClick());
      expect(tree!.root.findByProps({ className: "live-session ls-library-backdrop" }).props["data-reader-size"]).toBe(size);
      await act(async () => tree!.unmount()); tree = undefined;
    }
  });
  it("offers three panel jumps without hiding any teaching content", async () => {
    const book = adaptTutorPlaybookPackage(await syntheticPlaybook(1));
    const stage = book.stagesByRoute[book.routes[0]!.id]![0]!;
    const move = vi.fn();
    await act(async () => { tree = create(<StageCard stage={stage} question={stage.questions![0]} questionIndex={0} flowStep="teach" complete={false} onFlowStepChange={move} />); });
    const jumps = tree!.root.findByProps({ "aria-label": "Jump to teaching panel" }).findAllByType("button");
    for (let i = 0; i < 3; i++) { await act(async () => jumps[i]!.props.onClick()); expect(move).toHaveBeenLastCalledWith(["teach", "ask", "answer"][i]); }
    expect(tree!.root.findAll(node => node.props.className === "ls-command-block__body")).toHaveLength(3);
  });
  it("uses source scaling and reflow contracts, not CSS zoom or a dark-mode workaround", () => {
    const css = readFileSync(new URL("./liveSession.css", import.meta.url), "utf8");
    expect(css.match(/font-size: calc\([^;]*var\(--ls-reader-scale/g)!.length).toBeGreaterThan(150);
    expect(css).toContain('color-scheme: only light');
    expect(css).toContain('grid-template-rows: auto minmax(0, 1fr)');
    expect(css).toContain('@media (max-width: 899px)');
    expect(css).toContain('@media (min-width: 900px) and (max-height: 650px)');
    expect(css).toContain('.ls-panel-jumps { display: flex; position: sticky;');
    expect(css).not.toMatch(/\bzoom\s*:|prefers-color-scheme:\s*dark/);
    expect(readFileSync(new URL("../../../index.html", import.meta.url), "utf8")).toContain('name="color-scheme" content="light"');
  });
});
