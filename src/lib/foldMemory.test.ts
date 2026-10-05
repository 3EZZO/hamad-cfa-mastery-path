import { afterEach, describe, expect, it, vi } from "vitest";
import {
  EMPTY_FOLDS,
  FOLD_STORAGE_KEY,
  foldIdsAround,
  isFoldOpen,
  loadFoldMemory,
  saveFoldMemory,
  withFold,
  withFoldsOpen,
  withSection,
  type FoldNode,
} from "./foldMemory";

describe("fold memory", () => {
  it("is open by default and remembers each fold", () => {
    expect(isFoldOpen(EMPTY_FOLDS, "tests:results")).toBe(true);
    expect(isFoldOpen(EMPTY_FOLDS, "practice:gaps", false)).toBe(false);
    const closed = withFold(EMPTY_FOLDS, "tests:results", false);
    expect(isFoldOpen(closed, "tests:results")).toBe(false);
    expect(isFoldOpen(closed, "tests:upload")).toBe(true);
  });

  it("collapses or expands a whole section and forgets its single choices", () => {
    let memory = withFold(EMPTY_FOLDS, "tests:results", true);
    memory = withFold(memory, "overview:inbox", false);
    memory = withSection(memory, "tests", false);
    expect(isFoldOpen(memory, "tests:results")).toBe(false);
    expect(isFoldOpen(memory, "tests:topic-Economics")).toBe(false);
    // Other sections keep their choices.
    expect(isFoldOpen(memory, "overview:inbox")).toBe(false);
    expect(isFoldOpen(memory, "overview:insights")).toBe(true);
    // A single fold can still be opened after Collapse all, and a jump opens several.
    expect(isFoldOpen(withFold(memory, "tests:upload", true), "tests:upload")).toBe(true);
    const jumped = withFoldsOpen(memory, ["tests:compose", "tests:results"]);
    expect([isFoldOpen(jumped, "tests:compose"), isFoldOpen(jumped, "tests:results"), isFoldOpen(jumped, "tests:upload")]).toEqual([true, true, false]);
    expect(isFoldOpen(withSection(memory, "tests", true), "tests:results")).toBe(true);
  });

  it("finds every fold around an element, innermost first", () => {
    const node = (fold: string | null, parent: FoldNode | null): FoldNode => {
      const self: FoldNode = {
        parentElement: parent,
        getAttribute: () => fold,
        closest: () => (fold ? self : parent?.closest("[data-fold-id]") ?? null),
      };
      return self;
    };
    const panel = node("tests:topic-Economics", node(null, null));
    const row = node(null, node(null, panel));
    expect(foldIdsAround(row)).toEqual(["tests:topic-Economics"]);
    const nested = node("activity:day-Today", node(null, node("activity:feed", null)));
    expect(foldIdsAround(node(null, nested))).toEqual(["activity:day-Today", "activity:feed"]);
    expect(foldIdsAround(node(null, null))).toEqual([]);
  });
});

describe("fold storage", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("saves and loads, ignoring anything malformed", () => {
    const store = new Map<string, string>();
    vi.stubGlobal("localStorage", { getItem: (key: string) => store.get(key) ?? null, setItem: (key: string, value: string) => store.set(key, value) });
    saveFoldMemory(withSection(withFold(EMPTY_FOLDS, "tests:results", false), "records", false));
    expect(loadFoldMemory()).toEqual({ folds: { "tests:results": false }, sections: { records: false } });
    store.set(FOLD_STORAGE_KEY, JSON.stringify({ folds: { a: "yes", b: true }, sections: 3 }));
    expect(loadFoldMemory()).toEqual({ folds: { b: true }, sections: {} });
    store.set(FOLD_STORAGE_KEY, "{not json");
    expect(loadFoldMemory()).toEqual(EMPTY_FOLDS);
  });

  it("keeps working when storage is unavailable", () => {
    vi.stubGlobal("localStorage", { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } });
    expect(loadFoldMemory()).toEqual(EMPTY_FOLDS);
    expect(() => saveFoldMemory(EMPTY_FOLDS)).not.toThrow();
  });
});
