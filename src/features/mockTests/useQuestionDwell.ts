import { useCallback, useEffect, useRef } from "react";

/** Periodic flush so a reload loses at most this much of the estimate. */
export const DWELL_FLUSH_MS = 60_000;

/** Adds `ms` to one question's running total; returns a new array. */
export function addDwell(dwellMs: readonly number[], index: number, ms: number): number[] {
  const next = [...dwellMs];
  if (index >= 0 && index < next.length && ms > 0) next[index] = Math.round((next[index] ?? 0) + ms);
  return next;
}

function pageActive(): boolean {
  return document.visibilityState === "visible" && document.hasFocus();
}

/**
 * Estimates time spent on each question of a paper. Time accrues only while
 * the exam page is visible and focused, to the question on screen. It is
 * handed over on navigation, when the page hides or loses focus, and every
 * minute; `take()` returns the remainder at submission. An estimate for the
 * tutor, not an integrity record: a reload loses at most the last minute.
 */
export function useQuestionDwell(
  enabled: boolean,
  index: number,
  onAccrue: (index: number, ms: number) => void,
): { take: () => { index: number; ms: number } } {
  const state = useRef({ index, since: null as number | null, pending: 0 });
  const onAccrueRef = useRef(onAccrue);
  onAccrueRef.current = onAccrue;

  const settle = useCallback(() => {
    const current = state.current;
    if (current.since !== null) {
      const now = Date.now();
      current.pending += now - current.since;
      current.since = now;
    }
  }, []);

  const flush = useCallback(() => {
    settle();
    const { index: at, pending } = state.current;
    state.current.pending = 0;
    if (pending > 0) onAccrueRef.current(at, pending);
  }, [settle]);

  // A new question: hand the previous one its time, then start counting here.
  useEffect(() => {
    if (!enabled) return;
    flush();
    state.current.index = index;
    state.current.since = pageActive() ? Date.now() : null;
  }, [enabled, index, flush]);

  useEffect(() => {
    if (!enabled) return;
    const pause = () => {
      flush();
      state.current.since = null;
    };
    const resume = () => {
      if (state.current.since === null && pageActive()) state.current.since = Date.now();
    };
    const onVisibility = () => (document.visibilityState === "visible" ? resume() : pause());
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("blur", pause);
    window.addEventListener("focus", resume);
    window.addEventListener("pagehide", pause);
    const timer = window.setInterval(flush, DWELL_FLUSH_MS);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("blur", pause);
      window.removeEventListener("focus", resume);
      window.removeEventListener("pagehide", pause);
      window.clearInterval(timer);
    };
  }, [enabled, flush]);

  const take = useCallback(() => {
    settle();
    const result = { index: state.current.index, ms: state.current.pending };
    state.current.pending = 0;
    state.current.since = null;
    return result;
  }, [settle]);

  return { take };
}
