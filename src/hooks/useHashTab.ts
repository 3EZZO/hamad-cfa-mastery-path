import { useCallback, useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { buildHash, parseHash, readSegment, resolveLegacyRoute, writeSegment } from "../lib/hashRoute";

interface HashTabOptions<T extends string> {
  /** Window title for a tab; applied on every change and on first load. */
  title?: (tab: T) => string;
}

function readHash<T extends string>(allowed: readonly T[], fallback: T): T {
  if (typeof window === "undefined") return fallback;
  // `#tab/segment`: only the tab part selects the view; the segment belongs
  // to that view (see useHashSegment).
  const route = parseHash(window.location.hash);
  if ((allowed as readonly string[]).includes(route.tab)) return route.tab as T;
  // A retired tab: rewrite its link in place to the view that now hosts it,
  // before any segment reader looks, so the old sub-route is kept.
  const moved = resolveLegacyRoute(route);
  if (moved && (allowed as readonly string[]).includes(moved.tab)) {
    const next = buildHash(moved.tab, moved.segment);
    const history = (window as Window & { history?: History }).history;
    if (history && typeof history.replaceState === "function") history.replaceState(null, "", next);
    else window.location.hash = next;
    return moved.tab as T;
  }
  return fallback;
}

function reducedMotion(): boolean {
  return typeof window !== "undefined"
    && typeof window.matchMedia === "function"
    && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Mirrors the active tab to `location.hash` so reload, back/forward and
 * pasted links work, and cross-fades tab switches through the View
 * Transitions API where the browser supports it (plain switch otherwise and
 * under reduced motion). No hash is written until the user changes tab, so
 * the launch URL stays clean.
 */
export function useHashTab<T extends string>(
  allowed: readonly T[],
  fallback: T,
  options: HashTabOptions<T> = {},
): [T, (tab: T) => void] {
  const [tab, setTab] = useState<T>(() => readHash(allowed, fallback));
  // The tab most recently requested, updated synchronously so a hashchange
  // arriving while a view transition is still pending is not applied twice.
  const targetRef = useRef(tab);
  const titleRef = useRef(options.title);
  titleRef.current = options.title;

  const applyTab = useCallback((next: T) => {
    targetRef.current = next;
    const update = () => setTab(next);
    const transition = typeof document !== "undefined"
      ? (document as Document & { startViewTransition?: (callback: () => void) => unknown }).startViewTransition
      : undefined;
    if (typeof transition === "function" && !reducedMotion()) {
      transition.call(document, () => flushSync(update));
    } else {
      update();
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const onHashChange = () => {
      const next = readHash(allowed, fallback);
      if (next !== targetRef.current) applyTab(next);
    };
    // The allowed set can change (navigation layout): re-check the current
    // link so a tab that is no longer offered moves to its new home.
    if (!(allowed as readonly string[]).includes(targetRef.current)) onHashChange();
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, [allowed, applyTab, fallback]);

  useEffect(() => {
    if (typeof document === "undefined" || !titleRef.current) return;
    document.title = titleRef.current(tab);
  }, [tab]);

  const navigate = useCallback((next: T) => {
    if (next === targetRef.current) return;
    if (typeof window !== "undefined") window.location.hash = next;
    applyTab(next);
  }, [applyTab]);

  return [tab, navigate];
}

/**
 * The `segment` part of `#tab/segment` for one view. Reads the current value
 * on mount and follows `hashchange` (back/forward, pasted links); `set`
 * rewrites the hash in place without adding a history entry. Reading and
 * writing are limited to the time `tab` is the active tab, so a mounted but
 * hidden consumer never touches another view's URL.
 */
export function useHashSegment(
  tab: string,
  activeTab: string,
): [string, (segment: string) => void] {
  const active = tab === activeTab;
  const [segment, setSegment] = useState(() => (active ? readSegment(tab) : ""));
  // Whether `segment` has caught up with the hash since this tab became
  // active. On the render that activates the tab the state still holds the
  // previous value, so read the live hash instead: otherwise a view briefly
  // sees no segment and can overwrite the link (e.g. #roadmap/week-18
  // becoming the current week).
  const synced = useRef(active);

  useEffect(() => {
    if (!active || typeof window === "undefined") {
      synced.current = false;
      return;
    }
    synced.current = true;
    setSegment(readSegment(tab));
    const onHashChange = () => setSegment(readSegment(tab));
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, [active, tab]);

  const set = useCallback((next: string) => {
    setSegment(next);
    if (active) writeSegment(tab, next);
  }, [active, tab]);

  return [active && !synced.current ? readSegment(tab) : segment, set];
}
