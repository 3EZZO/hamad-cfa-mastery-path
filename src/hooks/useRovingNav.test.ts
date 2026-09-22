import { describe, expect, it, vi } from "vitest";
import { rovingKeyDown, rovingTabIndex } from "./useRovingNav";

// Modeled DOM: the container answers querySelectorAll with fake items whose
// focus() is spied. This exercises the index arithmetic, not browser focus.
function makeItems(count: number) {
  return Array.from({ length: count }, (_, index) => ({ index, focus: vi.fn() }));
}

function keyEvent(
  key: string,
  items: ReturnType<typeof makeItems>,
  target: unknown,
  modifiers: Partial<Pick<KeyboardEvent, "altKey" | "ctrlKey" | "metaKey">> = {},
) {
  return {
    key,
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    ...modifiers,
    target,
    currentTarget: { querySelectorAll: () => items as unknown as ArrayLike<HTMLElement> },
    preventDefault: vi.fn(),
  };
}

const focused = (items: ReturnType<typeof makeItems>) =>
  items.filter(item => item.focus.mock.calls.length > 0).map(item => item.index);

describe("rovingKeyDown", () => {
  it("moves down and up in a vertical group and wraps at both ends", () => {
    const items = makeItems(3);
    const down = keyEvent("ArrowDown", items, items[2]);
    rovingKeyDown(down as never, "vertical");
    expect(focused(items)).toEqual([0]);
    expect(down.preventDefault).toHaveBeenCalled();

    const fresh = makeItems(3);
    rovingKeyDown(keyEvent("ArrowUp", fresh, fresh[0]) as never, "vertical");
    expect(focused(fresh)).toEqual([2]);
  });

  it("uses left/right for a horizontal group and ignores up/down there", () => {
    const items = makeItems(4);
    rovingKeyDown(keyEvent("ArrowRight", items, items[1]) as never, "horizontal");
    expect(focused(items)).toEqual([2]);

    const untouched = makeItems(4);
    const event = keyEvent("ArrowDown", untouched, untouched[1]);
    rovingKeyDown(event as never, "horizontal");
    expect(focused(untouched)).toEqual([]);
    expect(event.preventDefault).not.toHaveBeenCalled();
  });

  it("jumps to the first and last item with Home and End", () => {
    const items = makeItems(5);
    rovingKeyDown(keyEvent("End", items, items[1]) as never, "vertical");
    expect(focused(items)).toEqual([4]);
    const more = makeItems(5);
    rovingKeyDown(keyEvent("Home", more, more[3]) as never, "horizontal");
    expect(focused(more)).toEqual([0]);
  });

  it("starts from the edge when the event target is not one of the items", () => {
    const items = makeItems(3);
    rovingKeyDown(keyEvent("ArrowDown", items, { other: true }) as never, "vertical");
    expect(focused(items)).toEqual([0]);
    const back = makeItems(3);
    rovingKeyDown(keyEvent("ArrowUp", back, { other: true }) as never, "vertical");
    expect(focused(back)).toEqual([2]);
  });

  it("leaves modified keys and unrelated keys to other handlers", () => {
    const items = makeItems(3);
    const alt = keyEvent("ArrowDown", items, items[0], { altKey: true });
    rovingKeyDown(alt as never, "vertical");
    const enter = keyEvent("Enter", items, items[0]);
    rovingKeyDown(enter as never, "vertical");
    expect(focused(items)).toEqual([]);
    expect(alt.preventDefault).not.toHaveBeenCalled();
    expect(enter.preventDefault).not.toHaveBeenCalled();
  });

  it("does nothing for an empty group", () => {
    const event = keyEvent("ArrowDown", [], null);
    expect(() => rovingKeyDown(event as never, "vertical")).not.toThrow();
    expect(event.preventDefault).not.toHaveBeenCalled();
  });
});

describe("rovingTabIndex", () => {
  const ids = ["dashboard", "plan", "practice"] as const;

  it("makes only the active item tabbable", () => {
    expect(ids.map(id => rovingTabIndex(ids, "plan", id))).toEqual([-1, 0, -1]);
  });

  it("falls back to the first item when the active section is elsewhere", () => {
    expect(ids.map(id => rovingTabIndex(ids, "payments" as never, id))).toEqual([0, -1, -1]);
  });
});
