import { useCallback, type KeyboardEvent as ReactKeyboardEvent } from "react";

export type RovingOrientation = "vertical" | "horizontal";

const ITEM_SELECTOR = "button:not([disabled]), a[href]";

/** The keys that move focus for each orientation; the others are ignored. */
const MOVES: Record<RovingOrientation, Record<string, number | "first" | "last">> = {
  vertical: { ArrowDown: 1, ArrowUp: -1, Home: "first", End: "last" },
  horizontal: { ArrowRight: 1, ArrowLeft: -1, Home: "first", End: "last" },
};

interface RovingKeyEvent {
  key: string;
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  target: EventTarget | null;
  currentTarget: { querySelectorAll(selector: string): ArrayLike<HTMLElement> };
  preventDefault(): void;
}

/**
 * Moves focus between the items of a navigation group with the arrow keys,
 * wrapping at either end. Activation stays with Enter/Space on the item
 * itself, so a keyboard user can browse sections without switching views.
 * Modified keys (Alt+digit, Ctrl+K) are left to the global shortcuts.
 */
export function rovingKeyDown(event: RovingKeyEvent, orientation: RovingOrientation): void {
  if (event.altKey || event.ctrlKey || event.metaKey) return;
  const move = MOVES[orientation][event.key];
  if (move === undefined) return;

  const items = Array.from(event.currentTarget.querySelectorAll(ITEM_SELECTOR));
  if (!items.length) return;
  const current = items.indexOf(event.target as HTMLElement);

  let next: number;
  if (move === "first") next = 0;
  else if (move === "last") next = items.length - 1;
  else if (current < 0) next = move > 0 ? 0 : items.length - 1;
  else next = (current + move + items.length) % items.length;

  event.preventDefault();
  items[next].focus();
}

/**
 * Roving tabindex for a `<nav>` of buttons: the caller gives the active item
 * `tabIndex={0}` and the rest `-1` (see `rovingTabIndex`); this handler adds
 * arrow-key movement on the container.
 */
export function useRovingNav(orientation: RovingOrientation) {
  return useCallback(
    (event: ReactKeyboardEvent<HTMLElement>) => rovingKeyDown(event, orientation),
    [orientation],
  );
}

/**
 * Picks the single tabbable item: the active one, or the first item when
 * the active section is not in this group (e.g. it lives behind "More").
 */
export function rovingTabIndex<T>(ids: readonly T[], active: T, id: T): 0 | -1 {
  const tabbable = ids.includes(active) ? active : ids[0];
  return id === tabbable ? 0 : -1;
}
