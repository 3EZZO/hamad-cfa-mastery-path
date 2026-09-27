import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDefaultState } from "../lib/storage";
import { RoadmapView } from "./RoadmapView";

// Modeled DOM: each week's <details> gets a node whose scrollIntoView is recorded.
const scrolled: number[] = [];
let tree: ReactTestRenderer | undefined;

function render(focusWeek: number | null) {
  return (
    <RoadmapView
      tracker={createDefaultState()}
      currentWeek={4}
      focusWeek={focusWeek}
      onFocusWeek={vi.fn()}
      onOpenWeek={vi.fn()}
    />
  );
}

async function mount(focusWeek: number | null) {
  await act(async () => {
    tree = create(render(focusWeek), {
      createNodeMock: (element) => {
        if (element.type !== "details") return null;
        // The week number is the text of the summary's first span (e.g. "12").
        type Node = { props?: { children?: unknown } };
        const kids = (node: Node | undefined) => ([] as unknown[]).concat(node?.props?.children ?? []);
        const summary = kids(element as Node).find((child) => (child as { type?: unknown })?.type === "summary") as Node;
        const index = kids(summary)[0] as Node;
        const week = Number(kids(index)[0]);
        return { scrollIntoView: () => scrolled.push(week) };
      },
    });
  });
}

beforeEach(() => {
  scrolled.length = 0;
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("window", {
    setTimeout: (callback: () => void) => { callback(); return 1; },
    clearTimeout: () => undefined,
  });
  vi.stubGlobal("requestAnimationFrame", () => 0);
  vi.stubGlobal("cancelAnimationFrame", () => undefined);
});

afterEach(async () => {
  if (tree) await act(async () => tree!.unmount());
  tree = undefined;
  vi.unstubAllGlobals();
});

describe("Full plan week links", () => {
  it("scrolls to the week a link names, once", async () => {
    await mount(12);
    expect(scrolled).toEqual([12]);
    await act(async () => tree!.update(render(12)));
    expect(scrolled).toEqual([12]);
  });

  it("scrolls when a link arrives after the view is already open", async () => {
    await mount(null);
    expect(scrolled).toEqual([]);
    await act(async () => tree!.update(render(9)));
    expect(scrolled).toEqual([9]);
  });

  it("does not jump to a week opened by hand", async () => {
    await mount(null);
    // Week summaries only (the page also has a "Plan overview & filters" summary).
    const summaries = tree!.root.findAllByType("summary").filter((summary) => typeof summary.props.onClick === "function");
    await act(async () => summaries[6]!.props.onClick());
    await act(async () => tree!.update(render(7)));
    expect(scrolled).toEqual([]);
  });
});
