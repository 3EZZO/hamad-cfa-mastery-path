import { useCallback, useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";

interface HashTabOptions<T extends string> {
  /** Window title for a tab; applied on every change and on first load. */
  title?: (tab: T) => string;
}

function readHash<T extends string>(allowed: readonly T[], fallback: T): T {
  if (typeof window === "undefined") return fallback;
  const candidate = window.location.hash.replace(/^#/, "");
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
