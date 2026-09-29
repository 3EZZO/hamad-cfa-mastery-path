import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { SESSION_THEME_STORAGE_KEY, ThemeProvider, ThemeToggle, THEME_STORAGE_KEY, readSessionTheme, readTheme, useSessionThemeScope } from "./ThemeToggle";

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
    expect(meta).toHaveBeenCalledWith("content", "#0a1120");
    expect(tree!.root.findAllByType("button")[2]!.children.join("")).toBe("Deck 18");
    await act(async () => tree!.root.findAllByType("button")[1]!.props.onClick());
    expect(root.dataset.theme).toBe("light"); expect(saved).toBe("light");
  });
  it("opens Session Mode dark by default and keeps its own preference", async () => {
    function SessionScope() { useSessionThemeScope(); return <ThemeToggle />; }
    const values: Record<string, string> = { [THEME_STORAGE_KEY]: "light" };
    vi.stubGlobal("localStorage", { getItem: (key: string) => values[key] ?? null, setItem: (key: string, value: string) => { values[key] = value; } });
    expect(readSessionTheme()).toBe("dark");
    await act(async () => { tree = create(<ThemeProvider><SessionScope /></ThemeProvider>); });
    expect(root.dataset.theme).toBe("dark");
    await act(async () => tree!.root.findByType("button").props.onClick());
    expect(root.dataset.theme).toBe("light");
    expect(values).toEqual({ [THEME_STORAGE_KEY]: "light", [SESSION_THEME_STORAGE_KEY]: "light" });
    await act(async () => tree!.update(<ThemeProvider><ThemeToggle /></ThemeProvider>));
    expect(root.dataset.theme).toBe("light");
    values[SESSION_THEME_STORAGE_KEY] = "dark";
    await act(async () => tree!.update(<ThemeProvider><SessionScope /></ThemeProvider>));
    await act(async () => listeners.storage!({ key: SESSION_THEME_STORAGE_KEY }));
    expect(root.dataset.theme).toBe("dark");
    await act(async () => tree!.update(<ThemeProvider><ThemeToggle /></ThemeProvider>));
    expect(root.dataset.theme).toBe("light");
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
  it("routes the global focus rings through one token pair per theme", () => {
    // Source contract only: the rendered ring still needs a browser check.
    const styles = readFileSync(new URL("../styles.css", import.meta.url), "utf8");
    const theme = readFileSync(new URL("../theme.css", import.meta.url), "utf8");
    const session = readFileSync(new URL("../features/liveSession/liveSession.css", import.meta.url), "utf8");
    expect(styles).toMatch(/:root\s*\{[^}]*--focus-ring:\s*#24427f;[^}]*--focus-ring-halo:\s*#fff;/);
    expect(theme).toMatch(/html:root\[data-theme="dark"\]\s*\{[^}]*--focus-ring:\s*#e2c27a;[^}]*--focus-ring-halo:\s*#0a1120;/);
    const globalRing = /:is\((?:a, button|button, a), input, select, textarea, summary, \[tabindex\]\):focus-visible\s*\{\s*outline: 3px solid var\(--focus-ring\); outline-offset: 2px; box-shadow: 0 0 0 2px var\(--focus-ring-halo\);/;
    expect(styles).toMatch(globalRing);
    expect(theme).toMatch(globalRing);
    expect(session).toMatch(globalRing);
  });
  it("keeps authored light and dark text and focus pairs above WCAG contrast thresholds", () => {
    const luminance = (hex: string) => {
      const channels = hex.match(/\w\w/g)!.map(value => parseInt(value, 16) / 255).map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4);
      return channels[0]! * .2126 + channels[1]! * .7152 + channels[2]! * .0722;
    };
    for (const [text, background] of [
      ["f2ecde", "0a1120"], ["f2ecde", "1f2c46"], ["aeb1bc", "121c30"], ["aeb1bc", "18243b"],
      ["aeb1bc", "1a2742"], ["dcbb72", "121c30"], ["aec4ee", "121c30"], ["aec4ee", "26365a"],
      ["aec4ee", "1d2b48"], ["8fd3b6", "16352d"], ["8fd3b6", "153430"], ["c9bcff", "322f4b"],
      ["f2ecde", "322f4b"], ["e2c27a", "3a3020"], ["f2a7ae", "43222a"], ["dfd0ff", "36294b"],
      ["ffffff", "213a6b"], ["ffffff", "2f4d8a"], ["e2c27a", "0a1120"],
      // Light theme and the navy cards shared by both themes.
      ["14213d", "f5f1e8"], ["595f6f", "f5f1e8"], ["595f6f", "f1ebdf"], ["85621a", "fffdf8"],
      ["85621a", "f5f1e8"], ["85621a", "f5edd9"], ["24427f", "fffdf8"], ["24427f", "e8ebf2"],
      ["17684f", "e3f0e8"], ["a3343f", "f9e8e7"], ["8a5a0a", "fbf0d9"], ["ffffff", "1b2d52"],
      ["f4efe3", "0f1a33"], ["c3c8d4", "1b2d52"], ["d8b563", "1b2d52"], ["0f1a33", "d2ab55"],
      ["bda97c", "0f1a33"], ["24427f", "ffffff"],
    ]) {
      const [light, dark] = [luminance(text!), luminance(background!)].sort((a, b) => b - a);
      expect((light! + .05) / (dark! + .05), `${text}/${background}`).toBeGreaterThanOrEqual(4.5);
    }
  });
});
