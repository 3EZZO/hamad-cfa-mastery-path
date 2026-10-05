import { act, create, type ReactTestInstance, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FOLD_STORAGE_KEY } from "../../lib/foldMemory";
import { Fold, FoldProvider, FoldToolbar } from "./Fold";

function textOf(node: ReactTestInstance): string {
  return node.children.map((child) => (typeof child === "string" ? child : textOf(child))).join("");
}

let tree: ReactTestRenderer | undefined;
const store = new Map<string, string>();

async function render(element: React.ReactElement) {
  await act(async () => { tree = create(element); });
  return tree!.root;
}

const fold = (root: ReactTestInstance, id: string) => root.find((node) => node.type === "section" && node.props["data-fold-id"] === id);
const toggle = (root: ReactTestInstance, id: string) => fold(root, id).find((node) => node.props.className === "coach-fold__toggle");
const body = (root: ReactTestInstance, id: string) => fold(root, id).find((node) => node.props.className === "coach-fold__body");

const page = (
  <FoldProvider>
    <FoldToolbar section="tests" />
    <Fold id="tests:upload" title="Upload a test" summary="Drafts stay hidden">Upload body</Fold>
    <Fold id="tests:results" variant="sub" title="Student results" meta="3 finished">Results body</Fold>
    <Fold id="overview:inbox" title="Inbox">Inbox body</Fold>
  </FoldProvider>
);

describe("Fold", () => {
  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    store.clear();
    vi.stubGlobal("localStorage", { getItem: (key: string) => store.get(key) ?? null, setItem: (key: string, value: string) => store.set(key, value) });
  });
  afterEach(async () => {
    if (tree) await act(async () => tree!.unmount());
    tree = undefined;
    vi.unstubAllGlobals();
  });

  it("opens and closes from its header button, with a summary while closed", async () => {
    const root = await render(<Fold id="tests:upload" title="Upload a test" summary="Drafts stay hidden" meta="Always shown">Body</Fold>);
    expect(toggle(root, "tests:upload").props["aria-expanded"]).toBe(true);
    expect(toggle(root, "tests:upload").props["aria-controls"]).toBe(body(root, "tests:upload").props.id);
    expect(body(root, "tests:upload").props.hidden).toBe(false);
    expect(textOf(fold(root, "tests:upload"))).not.toContain("Drafts stay hidden");
    await act(async () => toggle(root, "tests:upload").props.onClick());
    expect(toggle(root, "tests:upload").props["aria-expanded"]).toBe(false);
    expect(body(root, "tests:upload").props.hidden).toBe(true);
    expect(textOf(fold(root, "tests:upload"))).toContain("Drafts stay hidden");
    expect(textOf(fold(root, "tests:upload"))).toContain("Always shown");
  });

  it("collapses and expands every fold of one section, and remembers it", async () => {
    let root = await render(page);
    const button = (label: string) => root.find((node) => node.type === "button" && textOf(node).trim() === label);
    await act(async () => button("Collapse all").props.onClick());
    expect(body(root, "tests:upload").props.hidden).toBe(true);
    expect(body(root, "tests:results").props.hidden).toBe(true);
    expect(body(root, "overview:inbox").props.hidden).toBe(false);
    await act(async () => toggle(root, "tests:results").props.onClick());
    expect(body(root, "tests:results").props.hidden).toBe(false);
    expect(JSON.parse(store.get(FOLD_STORAGE_KEY)!)).toEqual({ folds: { "tests:results": true }, sections: { tests: false } });

    await act(async () => tree!.unmount());
    root = await render(page);
    expect(body(root, "tests:upload").props.hidden).toBe(true);
    expect(body(root, "tests:results").props.hidden).toBe(false);
    await act(async () => root.find((node) => node.type === "button" && textOf(node).trim() === "Expand all").props.onClick());
    expect(body(root, "tests:upload").props.hidden).toBe(false);
  });

  it("can start closed", async () => {
    const root = await render(<FoldProvider><Fold id="practice:gaps" variant="sub" defaultOpen={false} title="Gaps">Body</Fold></FoldProvider>);
    expect(body(root, "practice:gaps").props.hidden).toBe(true);
    expect(fold(root, "practice:gaps").props.className).toBe("coach-subfold");
  });
});
