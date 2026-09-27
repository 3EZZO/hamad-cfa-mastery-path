import { createElement, useState } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseWeekSegment, readSegment, weekSegment } from "../lib/hashRoute";
import { useHashSegment, useHashTab } from "./useHashTab";
import { useWeekMirror } from "./useWeekMirror";

// A modeled window: the hash, hashchange listeners and replaceState only.
let hash = "";
let listeners: Array<() => void> = [];
let tree: ReactTestRenderer | undefined;
let latest: { tab: string; week: number; navigate: (tab: string) => void; setWeek: (week: number) => void };

function Shell() {
  const [tab, navigate] = useHashTab<string>(["home", "weekly"], "home");
  const [, setSegment] = useHashSegment("weekly", tab);
  const [week, setWeek] = useState(4);
  useWeekMirror({
    active: tab === "weekly",
    readLinkedWeek: () => parseWeekSegment(readSegment("weekly"), 25),
    writeWeek: (next) => setSegment(weekSegment(next)),
    selectedWeek: week,
    setSelectedWeek: setWeek,
  });
  latest = { tab, week, navigate, setWeek };
  return createElement("span", null, `${tab}:${week}`);
}

function fireHashChange(next: string) {
  hash = next;
  listeners.forEach((listener) => listener());
}

beforeEach(() => {
  hash = "";
  listeners = [];
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("window", {
    get location() {
      return {
        get hash() { return hash; },
        set hash(value: string) { hash = value.startsWith("#") ? value : `#${value}`; },
      };
    },
    history: { replaceState: (_: unknown, __: string, next: string) => { hash = next; } },
    matchMedia: () => ({ matches: true }),
    addEventListener: (name: string, fn: () => void) => { if (name === "hashchange") listeners.push(fn); },
    removeEventListener: (name: string, fn: () => void) => { if (name === "hashchange") listeners = listeners.filter((l) => l !== fn); },
  });
  vi.stubGlobal("document", { title: "" });
});

afterEach(async () => {
  if (tree) await act(async () => tree!.unmount());
  tree = undefined;
  vi.unstubAllGlobals();
});

describe("useWeekMirror", () => {
  it("lets a week link opened while the app is running win over the current week", async () => {
    await act(async () => { tree = create(createElement(Shell)); });
    expect(latest.tab).toBe("home");
    await act(async () => fireHashChange("#weekly/week-7"));
    expect(latest.tab).toBe("weekly");
    expect(latest.week).toBe(7);
    expect(hash).toBe("#weekly/week-7");
  });

  it("writes the selected week when the view opens without one, and on every change", async () => {
    await act(async () => { tree = create(createElement(Shell)); });
    await act(async () => latest.navigate("weekly"));
    expect(hash).toBe("#weekly/week-4");
    await act(async () => latest.setWeek(5));
    expect(hash).toBe("#weekly/week-5");
  });

  it("follows back/forward inside the view without fighting it", async () => {
    hash = "#weekly/week-6";
    await act(async () => { tree = create(createElement(Shell)); });
    expect(latest.week).toBe(6);
    await act(async () => fireHashChange("#weekly/week-3"));
    // The app's own segment effect selects the linked week; the mirror must not rewrite it.
    expect(hash).toBe("#weekly/week-3");
  });
});
