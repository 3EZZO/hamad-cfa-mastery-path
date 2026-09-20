import { createElement } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useHashTab } from "./useHashTab";

// A modeled window/document, not a rendered browser: back/forward, the
// View Transitions API and reduced motion are simulated through stubs.
const TABS = ["dashboard", "practice", "mocks"] as const;
type Tab = (typeof TABS)[number];

let tree: ReactTestRenderer | undefined;
let hash: string;
let listeners: Record<string, Array<() => void>>;
let reduced: boolean;
let startViewTransition: ReturnType<typeof vi.fn> | undefined;
let doc: { title: string; startViewTransition?: unknown };
let latest: { tab: Tab; navigate: (tab: Tab) => void };

function Probe() {
  const [tab, navigate] = useHashTab<Tab>(TABS, "dashboard", {
    title: current => `${current} · Test`,
  });
  latest = { tab, navigate };
  return createElement("span", null, tab);
}

async function mount() {
  await act(async () => { tree = create(createElement(Probe)); });
}

function fireHashChange(next: string) {
  hash = next;
  for (const listener of listeners.hashchange ?? []) listener();
}

beforeEach(() => {
  hash = "";
  listeners = {};
  reduced = false;
  startViewTransition = undefined;
  doc = { title: "" };
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("window", {
    get location() {
      return {
        get hash() { return hash; },
        set hash(value: string) { hash = value.startsWith("#") ? value : `#${value}`; },
      };
    },
    matchMedia: () => ({ matches: reduced }),
    addEventListener: (name: string, fn: () => void) => { (listeners[name] ??= []).push(fn); },
    removeEventListener: (name: string, fn: () => void) => { listeners[name] = (listeners[name] ?? []).filter(l => l !== fn); },
  });
  vi.stubGlobal("document", doc);
});

afterEach(async () => {
  if (tree) await act(async () => tree!.unmount());
  tree = undefined;
  vi.unstubAllGlobals();
});

describe("useHashTab", () => {
  it("starts from a valid hash and falls back otherwise", async () => {
    hash = "#practice";
    await mount();
    expect(latest.tab).toBe("practice");
    await act(async () => tree!.unmount());

    hash = "#not-a-tab";
    await mount();
    expect(latest.tab).toBe("dashboard");
    expect(hash).toBe("#not-a-tab"); // nothing is written on load
  });

  it("writes the hash, updates state and the title when navigating", async () => {
    await mount();
    expect(doc.title).toBe("dashboard · Test");
    await act(async () => latest.navigate("mocks"));
    expect(hash).toBe("#mocks");
    expect(latest.tab).toBe("mocks");
    expect(doc.title).toBe("mocks · Test");
  });

  it("follows back/forward hash changes and ignores invalid ones", async () => {
    await mount();
    await act(async () => fireHashChange("#practice"));
    expect(latest.tab).toBe("practice");
    await act(async () => fireHashChange("#bogus"));
    expect(latest.tab).toBe("dashboard");
    await act(async () => fireHashChange(""));
    expect(latest.tab).toBe("dashboard");
  });

  it("removes its listener on unmount", async () => {
    await mount();
    expect(listeners.hashchange).toHaveLength(1);
    await act(async () => tree!.unmount());
    tree = undefined;
    expect(listeners.hashchange).toHaveLength(0);
  });

  it("uses the View Transitions API when available", async () => {
    startViewTransition = vi.fn((callback: () => void) => { callback(); });
    doc.startViewTransition = startViewTransition;
    await mount();
    await act(async () => latest.navigate("practice"));
    expect(startViewTransition).toHaveBeenCalledTimes(1);
    expect(latest.tab).toBe("practice");
  });

  it("does not apply the same tab twice when the hashchange echoes a navigation", async () => {
    startViewTransition = vi.fn((callback: () => void) => { callback(); });
    doc.startViewTransition = startViewTransition;
    await mount();
    await act(async () => { latest.navigate("practice"); fireHashChange("#practice"); });
    expect(startViewTransition).toHaveBeenCalledTimes(1);
    expect(latest.tab).toBe("practice");
  });

  it("skips the transition under reduced motion or without the API", async () => {
    startViewTransition = vi.fn((callback: () => void) => { callback(); });
    doc.startViewTransition = startViewTransition;
    reduced = true;
    await mount();
    await act(async () => latest.navigate("practice"));
    expect(startViewTransition).not.toHaveBeenCalled();
    expect(latest.tab).toBe("practice");
    await act(async () => tree!.unmount());

    reduced = false;
    delete doc.startViewTransition;
    hash = "";
    await mount();
    await act(async () => latest.navigate("mocks"));
    expect(latest.tab).toBe("mocks");
  });

  it("ignores navigation to the current tab", async () => {
    await mount();
    await act(async () => latest.navigate("dashboard"));
    expect(hash).toBe("");
  });
});
