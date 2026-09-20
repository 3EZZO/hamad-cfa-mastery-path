import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CommandPalette } from "./CommandPalette";
import type { PaletteCommand } from "../lib/commandPalette";

// DOM model shared with useDialogFocus.test.tsx; not a rendered browser.
class ElementModel {
  parentElement: ElementModel | null = null;
  children: ElementModel[] = [];
  attrs: Record<string, string> = {};
  style = { display: "block", visibility: "visible" };
  tabIndex = 0;
  isConnected = true;
  constructor(public tagName = "DIV") {}
  contains(node: unknown): boolean { return node === this || this.children.some(child => child.contains(node)); }
  hasAttribute(name: string) { return name in this.attrs; }
  matches() { return false; }
  closest() { return null; }
  querySelector() { return null; }
  querySelectorAll(): ElementModel[] { return []; }
  focus() { doc.activeElement = this; }
}

type Listener = (event: any) => void;
const documentListeners = new Map<string, Set<Listener>>();
const doc = {
  activeElement: null as ElementModel | null,
  addEventListener: (name: string, fn: Listener) => { (documentListeners.get(name) ?? documentListeners.set(name, new Set()).get(name)!).add(fn); },
  removeEventListener: (name: string, fn: Listener) => documentListeners.get(name)?.delete(fn),
  getElementById: () => null,
};

let tree: ReactTestRenderer | undefined;
let nodes: { input?: ElementModel; dialog?: ElementModel };
const onClose = vi.fn();
const runs = { home: vi.fn(), mocks: vi.fn(), theme: vi.fn() };
const commands: PaletteCommand[] = [
  { id: "home", label: "Home", group: "Go to", shortcut: "Alt+1", run: runs.home },
  { id: "mocks", label: "Mock Results", group: "Go to", hint: "Trend the score", run: runs.mocks },
  { id: "theme", label: "Toggle dark theme", group: "Actions", keywords: ["appearance"], run: runs.theme },
];

async function render(open = true) {
  await act(async () => {
    tree = create(<CommandPalette open={open} commands={commands} onClose={onClose} />, {
      createNodeMock: element => {
        const node = new ElementModel(String(element.type).toUpperCase());
        const props = element.props as Record<string, unknown>;
        if (props.role === "combobox") nodes.input = node;
        if (props.role === "dialog") nodes.dialog = node;
        return node;
      },
    });
  });
}

const input = () => tree!.root.findByProps({ role: "combobox" });
const options = () => tree!.root.findAll(node => typeof node.type === "string" && node.props.role === "option");
const activeId = () => options().find(option => option.props["aria-selected"])?.props.id;

beforeEach(() => {
  documentListeners.clear();
  doc.activeElement = null;
  nodes = {};
  onClose.mockReset();
  Object.values(runs).forEach(fn => fn.mockReset());
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("HTMLElement", ElementModel);
  vi.stubGlobal("document", doc);
  vi.stubGlobal("window", { getComputedStyle: (node: ElementModel) => node.style });
});

afterEach(async () => {
  if (tree) await act(async () => tree!.unmount());
  tree = undefined;
  vi.unstubAllGlobals();
});

describe("CommandPalette", () => {
  it("renders nothing while closed", async () => {
    await render(false);
    expect(tree!.toJSON()).toBeNull();
  });

  it("focuses the search field and lists commands under group headings", async () => {
    await render();
    expect(doc.activeElement).toBe(nodes.input);
    expect(options().map(option => option.props.id)).toEqual([
      "command-option-home", "command-option-mocks", "command-option-theme",
    ]);
    const headings = tree!.root.findAll(node => typeof node.type === "string" && node.props.className === "command-palette__group");
    expect(headings.map(node => node.children[0])).toEqual(["Go to", "Actions"]);
    expect(activeId()).toBe("command-option-home");
  });

  it("filters as the user types and moves the selection with the keyboard", async () => {
    await render();
    await act(async () => input().props.onChange({ target: { value: "mo" } }));
    expect(options().map(option => option.props.id)).toEqual(["command-option-mocks"]);
    expect(activeId()).toBe("command-option-mocks");

    await act(async () => input().props.onChange({ target: { value: "" } }));
    const preventDefault = vi.fn();
    await act(async () => input().props.onKeyDown({ key: "ArrowDown", preventDefault }));
    expect(activeId()).toBe("command-option-mocks");
    await act(async () => input().props.onKeyDown({ key: "ArrowUp", preventDefault }));
    await act(async () => input().props.onKeyDown({ key: "ArrowUp", preventDefault }));
    expect(activeId()).toBe("command-option-theme"); // wraps around
    await act(async () => input().props.onKeyDown({ key: "Home", preventDefault }));
    expect(activeId()).toBe("command-option-home");
    expect(preventDefault).toHaveBeenCalledTimes(4);
  });

  it("runs the active command on Enter and closes first", async () => {
    await render();
    const order: string[] = [];
    onClose.mockImplementation(() => order.push("close"));
    runs.home.mockImplementation(() => order.push("run"));
    await act(async () => input().props.onKeyDown({ key: "Enter", preventDefault: vi.fn() }));
    expect(order).toEqual(["close", "run"]);
  });

  it("runs a command on click", async () => {
    await render();
    await act(async () => options()[2].props.onClick());
    expect(runs.theme).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes on Escape through the dialog focus hook", async () => {
    await render();
    const event = { key: "Escape", preventDefault: vi.fn(), stopPropagation: vi.fn() };
    for (const listener of [...(documentListeners.get("keydown") ?? [])]) listener(event);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(event.stopPropagation).toHaveBeenCalled();
  });

  it("shows an empty state when nothing matches", async () => {
    await render();
    await act(async () => input().props.onChange({ target: { value: "zzz" } }));
    expect(options()).toHaveLength(0);
    expect(JSON.stringify(tree!.toJSON())).toContain("No matches");
  });
});
