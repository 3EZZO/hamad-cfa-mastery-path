import { useEffect, useRef } from "react";
import { DWELL_MS } from "./coverageModel";

const TICK_MS = 1_000;
const FLUSH_MS = 15_000;
/** A stalled timer (sleep, throttled tab) never counts more than this per tick. */
const MAX_TICK_GAP_MS = 5_000;

/**
 * Measures continuous time on one page while `counting` (session clock
 * running on a visible PDF surface). The page is reported once it reaches
 * DWELL_MS; teaching time is reported in batches and when counting stops.
 */
export function usePageDwell({ versionId, page, counting, onPageTaught, onSeconds }: {
  versionId: string | null;
  page: number | null;
  counting: boolean;
  onPageTaught: (versionId: string, page: number) => void;
  onSeconds: (versionId: string, seconds: number) => void;
}) {
  const callbacks = useRef({ onPageTaught, onSeconds });
  callbacks.current = { onPageTaught, onSeconds };

  useEffect(() => {
    if (!counting || !versionId || page === null) return;
    let visible = typeof document === "undefined" || !document.hidden;
    let last = Date.now();
    let dwell = 0;
    let pending = 0;
    let marked = false;
    const flush = () => {
      if (pending <= 0) return;
      callbacks.current.onSeconds(versionId, pending / 1_000);
      pending = 0;
    };
    const tick = () => {
      const now = Date.now();
      const delta = Math.min(Math.max(0, now - last), MAX_TICK_GAP_MS);
      last = now;
      if (!visible) return;
      dwell += delta;
      pending += delta;
      if (!marked && dwell >= DWELL_MS) {
        marked = true;
        callbacks.current.onPageTaught(versionId, page);
      }
      if (pending >= FLUSH_MS) flush();
    };
    const onVisibility = () => {
      tick();
      visible = !document.hidden;
      last = Date.now();
    };
    const handle = window.setInterval(tick, TICK_MS);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      tick();
      window.clearInterval(handle);
      document.removeEventListener("visibilitychange", onVisibility);
      flush();
    };
  }, [counting, page, versionId]);
}
