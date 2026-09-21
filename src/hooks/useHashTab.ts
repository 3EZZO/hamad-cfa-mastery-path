import { useCallback, useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { parseHash, readSegment, writeSegment } from "../lib/hashRoute";

interface HashTabOptions<T extends string> {
  /** Window title for a tab; applied on every change and on first load. */
  title?: (tab: T) => string;
}

function readHash<T extends string>(allowed: readonly T[], fallback: T): T {
  if (typeof window === "undefined") return fallback;
  // `#tab/segment`: only the tab part selects the view; the segment belongs
  // to that view (see useHashSegment).
  const candidate = parseHash(window.location.hash).tab;
  return (allowed as readonly string[]).includes(candidate) ? (candidate as T) : fallback;
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

  useEffect(() => {
    if (!active || typeof window === "undefined") return;
    setSegment(readSegment(tab));
    const onHashChange = () => setSegment(readSegment(tab));
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, [active, tab]);

  const set = useCallback((next: string) => {
    setSegment(next);
    if (active) writeSegment(tab, next);
  }, [active, tab]);

  return [segment, set];
}
