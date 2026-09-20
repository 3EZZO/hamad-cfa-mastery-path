import { createElement } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useGlobalShortcuts } from "./useGlobalShortcuts";

// Modeled window/document: keydown events are dispatched to the recorded
// window listeners; focus and element ancestry are simulated.
class ElementModel {
  constructor(private readonly selectors: string[] = []) {}
  closest(selector: string) {
    return selector.split(",").some(part => this.selectors.includes(part.trim())) ? this : null;
  }
}

let tree: ReactTestRenderer | undefined;
let listeners: Record<string, Array<(event: unknown) => void>>;
let activeElement: ElementModel | null;
const toggle = vi.fn();
const tabs = [vi.fn(), vi.fn(), vi.fn()];

function Probe(props: { paletteOpen?: boolean; helpKey?: boolean; enabled?: boolean; tabs?: Array<() => void> }) {
  useGlobalShortcuts({ onTogglePalette: toggle, tabs: props.tabs ?? tabs, paletteOpen: props.paletteOpen, helpKey: props.helpKey, enabled: props.enabled });
  return null;
}

async function mount(props: Parameters<typeof Probe>[0] = {}) {
  await act(async () => { tree = create(createElement(Probe, props)); });
}

function press(key: string, extra: Record<string, unknown> = {}) {
  const event = { key, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, target: null, preventDefault: vi.fn(), ...extra };
  for (const listener of listeners.keydown ?? []) listener(event);
  return event;
}

beforeEach(() => {
  listeners = {};
  activeElement = null;
  toggle.mockReset();
  tabs.forEach(fn => fn.mockReset());
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("HTMLElement", ElementModel);
  vi.stubGlobal("window", {
    addEventListener: (name: string, fn: (event: unknown) => void) => { (listeners[name] ??= []).push(fn); },
    removeEventListener: (name: string, fn: (event: unknown) => void) => { listeners[name] = (listeners[name] ?? []).filter(l => l !== fn); },
  });
  vi.stubGlobal("document", { get activeElement() { return activeElement; } });
});

afterEach(async () => {
  if (tree) await act(async () => tree!.unmount());
  tree = undefined;
  vi.unstubAllGlobals();
});

describe("useGlobalShortcuts", () => {
  it("toggles the palette on Ctrl+K and Meta+K, even inside a text field", async () => {
    await mount();
    const event = press("k", { ctrlKey: true, target: new ElementModel(["input"]) });
    expect(toggle).toHaveBeenCalledTimes(1);
    expect(event.preventDefault).toHaveBeenCalled();
    press("K", { metaKey: true });
    expect(toggle).toHaveBeenCalledTimes(2);
    press("k");
    expect(toggle).toHaveBeenCalledTimes(2);
  });

  it("jumps to the Nth tab on Alt+digit and ignores missing entries", async () => {
    await mount();
    press("2", { altKey: true });
    expect(tabs[1]).toHaveBeenCalledTimes(1);
    press("9", { altKey: true });
    expect(tabs.every(fn => fn.mock.calls.length <= 1)).toBe(true);
    press("2");
    expect(tabs[1]).toHaveBeenCalledTimes(1);
  });

  it("opens the palette on ? outside text fields only, and not when disabled for Session Mode", async () => {
    await mount();
    press("?", { target: new ElementModel(["textarea"]) });
    expect(toggle).not.toHaveBeenCalled();
    press("?");
    expect(toggle).toHaveBeenCalledTimes(1);
    await act(async () => tree!.unmount());
    tree = undefined;

    await mount({ helpKey: false });
    press("?");
    expect(toggle).toHaveBeenCalledTimes(1);
  });

  it("stays quiet while another dialog has focus, but Ctrl+K still closes the palette itself", async () => {
    await mount();
    activeElement = new ElementModel(["[role='dialog']"]);
    press("k", { ctrlKey: true });
    press("1", { altKey: true });
    press("?");
    expect(toggle).not.toHaveBeenCalled();
    expect(tabs[0]).not.toHaveBeenCalled();
    await act(async () => tree!.unmount());
    tree = undefined;

    await mount({ paletteOpen: true });
    press("k", { ctrlKey: true });
    expect(toggle).toHaveBeenCalledTimes(1);
    press("1", { altKey: true });
    expect(tabs[0]).not.toHaveBeenCalled();
  });

  it("registers nothing when disabled and removes its listener on unmount", async () => {
    await mount({ enabled: false });
    expect(listeners.keydown ?? []).toHaveLength(0);
    await act(async () => tree!.unmount());
    tree = undefined;
    await mount();
    expect(listeners.keydown).toHaveLength(1);
    await act(async () => tree!.unmount());
    tree = undefined;
    expect(listeners.keydown).toHaveLength(0);
  });
});
