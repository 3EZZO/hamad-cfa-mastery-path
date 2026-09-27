import { useSyncExternalStore } from "react";
import type { NavLayout } from "./navigation";

/**
 * Temporary, device-only switch back to the classic tab list while the
 * four-destination navigation settles. Like the theme, it lives only in this
 * browser's storage and never reaches the tracker or Firestore. To be
 * removed a few weeks after the new navigation ships.
 */
export const NAV_LAYOUT_STORAGE_KEY = "hamad-nav-layout";
const DEFAULT_LAYOUT: NavLayout = "destinations";

export function readNavLayout(): NavLayout {
  try {
    return localStorage.getItem(NAV_LAYOUT_STORAGE_KEY) === "classic" ? "classic" : DEFAULT_LAYOUT;
  } catch {
    return DEFAULT_LAYOUT;
  }
}

let current: NavLayout | null = null;
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((listener) => listener());
}

export function getNavLayout(): NavLayout {
  if (current === null) current = readNavLayout();
  return current;
}

export function setNavLayout(next: NavLayout): void {
  current = next;
  try {
    localStorage.setItem(NAV_LAYOUT_STORAGE_KEY, next);
  } catch {
    // Keep working in memory for this visit.
  }
  notify();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  const receive = (event: StorageEvent) => {
    if (event.key !== NAV_LAYOUT_STORAGE_KEY && event.key !== null) return;
    current = readNavLayout();
    listener();
  };
  if (typeof window !== "undefined") window.addEventListener("storage", receive);
  return () => {
    listeners.delete(listener);
    if (typeof window !== "undefined") window.removeEventListener("storage", receive);
  };
}

export function useNavLayout(): NavLayout {
  return useSyncExternalStore(subscribe, getNavLayout, () => DEFAULT_LAYOUT);
}

/** Test hook: forget the cached value so the next read goes back to storage. */
export function resetNavLayoutForTests(): void {
  current = null;
}
