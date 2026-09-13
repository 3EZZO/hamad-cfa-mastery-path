import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { ThemeProvider, ThemeToggle, THEME_STORAGE_KEY, readTheme } from "./ThemeToggle";

let tree: ReactTestRenderer | undefined;
let saved: string | null;
let root: { dataset: Record<string, string>; style: Record<string, string> };
let listeners: Record<string, (event: { key: string | null }) => void>;
const persist = vi.fn();
const meta = vi.fn();
function SessionStandIn() {
  const [deck, setDeck] = useState(17);
  return <button onClick={() => setDeck(deck + 1)}>Deck {deck}</button>;
}
async function mount() {
  await act(async () => { tree = create(<ThemeProvider><ThemeToggle /><ThemeToggle /><SessionStandIn /></ThemeProvider>); });
}
beforeEach(() => {
  saved = null; root = { dataset: {}, style: {} }; listeners = {};
  persist.mockReset().mockImplementation((_key, value) => { saved = value; }); meta.mockReset();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("localStorage", { getItem: () => saved, setItem: persist });
  vi.stubGlobal("document", { documentElement: root, querySelector: () => ({ setAttribute: meta }) });
  vi.stubGlobal("window", {
    addEventListener: (event: string, listener: (event: { key: string | null }) => void) => { listeners[event] = listener; },
    removeEventListener: (event: string) => { delete listeners[event]; },
  });
});
afterEach(async () => { if (tree) await act(async () => tree!.unmount()); tree = undefined; vi.unstubAllGlobals(); });

describe("shared tracker and Session Mode theme", () => {
  it("toggles both controls, document and preference without resetting session state", async () => {
    await mount();
    expect(root.dataset.theme).toBe("light"); expect(persist).not.toHaveBeenCalled();
    await act(async () => tree!.root.findAllByType("button")[2]!.props.onClick());
    await act(async () => tree!.root.findAllByType("button")[0]!.props.onClick());
    expect(root.dataset.theme).toBe("dark"); expect(root.style.colorScheme).toBe("dark");
    expect(tree!.root.findAllByProps({ "aria-label": "Switch to light theme" })).toHaveLength(2);
    expect(persist).toHaveBeenLastCalledWith(THEME_STORAGE_KEY, "dark");
    expect(meta).toHaveBeenCalledWith("content", "#101c2a");
    expect(tree!.root.findAllByType("button")[2]!.children.join("")).toBe("Deck 18");
    await act(async () => tree!.root.findAllByType("button")[1]!.props.onClick());
    expect(root.dataset.theme).toBe("light"); expect(saved).toBe("light");
  });
  it("restores the saved preference and accepts changes from another tab", async () => {
    saved = "dark"; await mount(); expect(root.dataset.theme).toBe("dark");
    saved = "light"; await act(async () => listeners.storage!({ key: THEME_STORAGE_KEY }));
    expect(root.dataset.theme).toBe("light"); expect(persist).not.toHaveBeenCalled();
    saved = "dark"; await act(async () => listeners.storage!({ key: "unrelated" }));
    expect(root.dataset.theme).toBe("light");
    saved = null; await act(async () => listeners.storage!({ key: null }));
    expect(root.dataset.theme).toBe("light");
  });
  it("works in memory when storage is blocked and rejects invalid preferences", async () => {
    saved = "invalid"; expect(readTheme()).toBe("light");
    vi.stubGlobal("localStorage", { getItem: () => { throw Error("blocked"); }, setItem: () => { throw Error("blocked"); } });
    await mount(); await act(async () => tree!.root.findAllByType("button")[0]!.props.onClick());
    expect(root.dataset.theme).toBe("dark");
  });
  it("restores dark mode before first paint without accessing any tracker data", () => {
    const code = readFileSync(new URL("../../public/theme-init.js", import.meta.url), "utf8");
    const getItem = vi.fn(() => "dark");
    runInNewContext(code, { localStorage: { getItem }, document: { documentElement: root } });
    expect(root.dataset.theme).toBe("dark"); expect(getItem).toHaveBeenCalledExactlyOnceWith(THEME_STORAGE_KEY);
    expect(() => runInNewContext(code, {})).not.toThrow();
    const html = readFileSync(new URL("../../index.html", import.meta.url), "utf8");
    expect(html.indexOf('./theme-init.js')).toBeLessThan(html.indexOf('/src/main.tsx'));
  });
  it("includes both entry points and dark surfaces for private portals and recovery", () => {
    for (const file of ["../App.tsx", "./TutorSessionWorkspace.tsx"]) {
      expect(readFileSync(new URL(file, import.meta.url), "utf8")).toContain("<ThemeToggle />");
    }
    const css = readFileSync(new URL("../theme.css", import.meta.url), "utf8");
    for (const selector of [".ls-library-backdrop", ".calendar-dialog", ".sync-recovery-notice", ".ls-rehearsal-banner", ".ls-command-block--answer", ".ls-command-block--question", ".ls-pacing-panel .ls-pacing-status__details small", ".timeline-week", ".timeline-body", ".evidence-contract", ".reading-coverage"]) expect(css).toContain(selector);
    expect(css).toContain('html:root[data-theme="dark"] .timeline-week');
    expect(css).toContain('html:root[data-theme="dark"] .timeline-body');
    expect(css).not.toMatch(/filter:\s*(invert|brightness)/);
  });
  it("keeps authored dark text and focus pairs above WCAG contrast thresholds", () => {
    const luminance = (hex: string) => {
      const channels = hex.match(/\w\w/g)!.map(value => parseInt(value, 16) / 255).map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4);
      return channels[0]! * .2126 + channels[1]! * .7152 + channels[2]! * .0722;
    };
    for (const [text, background] of [
      ["e5edf5", "192b3d"], ["a9bacd", "203448"], ["a8c5ff", "203550"],
      ["87d9c8", "193a3c"], ["c9bcff", "322f4b"], ["e5edf5", "322f4b"],
      ["f1ce88", "423724"], ["ffabb6", "492d3c"], ["dfd0ff", "36294b"], ["ffffff", "315fce"],
    ]) expect((luminance(text!) + .05) / (luminance(background!) + .05)).toBeGreaterThanOrEqual(4.5);
  });
});
