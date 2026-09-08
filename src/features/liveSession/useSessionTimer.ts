import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { SessionTimerSnapshot } from "./types";
import {
  activeClockBoundary, CLOCK_CHECKPOINT_MS, elapsedTimerMs,
  MAX_SESSION_ELAPSED_MS, pauseSessionTimer, recoverSessionTimer,
} from "./sessionClock";

export function formatSessionTime(milliseconds: number): string {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1_000));
  const hours = Math.floor(totalSeconds / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;
  return (hours > 0 ? String(hours).padStart(2, "0") + ":" : "")
    + String(minutes).padStart(2, "0") + ":" + String(seconds).padStart(2, "0");
}

export interface UseSessionTimerOptions {
  durationMinutes: number;
  initialSnapshot?: SessionTimerSnapshot | null;
  onSnapshotChange?: (snapshot: SessionTimerSnapshot) => void;
  onExpire?: () => void;
}

export interface SessionTimerController {
  snapshot: SessionTimerSnapshot;
  status: SessionTimerSnapshot["status"];
  elapsedMs: number;
  remainingMs: number;
  overtimeMs: number;
  progress: number;
  expired: boolean;
  display: string;
  start: (durationMinutes?: number) => void;
  pause: () => void;
  resume: () => void;
  toggle: () => void;
  finish: () => void;
  reset: (durationMinutes?: number) => void;
}

export function useSessionTimer({
  durationMinutes, initialSnapshot, onSnapshotChange, onExpire,
}: UseSessionTimerOptions): SessionTimerController {
  const [snapshot, setSnapshot] = useState(() =>
    recoverSessionTimer(initialSnapshot, durationMinutes),
  );
  const [clockMs, setClockMs] = useState(() => Date.now());
  const snapshotRef = useRef(snapshot);
  const lastObservedRef = useRef(clockMs);
  const changedRef = useRef(onSnapshotChange);
  changedRef.current = onSnapshotChange;
  const expiredNotifiedRef = useRef(false);

  const publish = useCallback((next: SessionTimerSnapshot) => {
    if (snapshotRef.current === next) return;
    snapshotRef.current = next;
    setSnapshot(next);
    // Persist via the parent immediately, including pagehide/unmount.
    changedRef.current?.(next);
  }, []);

  useEffect(() => { changedRef.current?.(snapshotRef.current); }, []);

  const pause = useCallback(() => {
    const atMs = activeClockBoundary(lastObservedRef.current, Date.now());
    setClockMs(atMs);
    publish(pauseSessionTimer(snapshotRef.current, atMs));
  }, [publish]);

  useEffect(() => {
    if (snapshot.status !== "running") return;
    const interval = window.setInterval(() => {
      const nowMs = Date.now();
      const boundary = activeClockBoundary(lastObservedRef.current, nowMs);
      const current = snapshotRef.current;
      if (current.status !== "running") return;
      if (boundary !== nowMs) {
        setClockMs(boundary);
        publish(pauseSessionTimer(current, boundary));
        return;
      }
      lastObservedRef.current = nowMs;
      setClockMs(nowMs);
      const elapsed = elapsedTimerMs(current, nowMs);
      if (elapsed >= MAX_SESSION_ELAPSED_MS) {
        publish(pauseSessionTimer(current, nowMs));
      } else if (nowMs - Date.parse(current.updatedAt) >= CLOCK_CHECKPOINT_MS) {
        // Device recovery checkpoint only: no cloud event on every tick.
        publish({
          ...current, elapsedBeforeRunMs: elapsed,
          runningSince: new Date(nowMs).toISOString(),
          updatedAt: new Date(nowMs).toISOString(),
        });
      }
    }, 250);
    return () => window.clearInterval(interval);
  }, [publish, snapshot.status]);

  useEffect(() => {
    const hide = () => { if (document.hidden) pause(); };
    document.addEventListener("visibilitychange", hide);
    window.addEventListener("pagehide", pause);
    return () => {
      document.removeEventListener("visibilitychange", hide);
      window.removeEventListener("pagehide", pause);
      pause();
    };
  }, [pause]);

  const elapsedMs = elapsedTimerMs(snapshot, clockMs);
  const remainingMs = Math.max(0, snapshot.durationMs - elapsedMs);
  const overtimeMs = Math.max(0, elapsedMs - snapshot.durationMs);
  const expired = elapsedMs >= snapshot.durationMs;

  useEffect(() => {
    if (!expired) expiredNotifiedRef.current = false;
    else if (!expiredNotifiedRef.current) {
      expiredNotifiedRef.current = true;
      onExpire?.();
    }
  }, [expired, onExpire]);

  const start = useCallback((override?: number) => {
    const nowMs = Date.now();
    lastObservedRef.current = nowMs;
    setClockMs(nowMs);
    publish({
      status: "running", durationMs: Math.max(1, override ?? durationMinutes) * 60_000,
      runningSince: new Date(nowMs).toISOString(), elapsedBeforeRunMs: 0,
      updatedAt: new Date(nowMs).toISOString(),
    });
  }, [durationMinutes, publish]);

  const resume = useCallback(() => {
    const current = snapshotRef.current;
    if (current.status !== "paused") return;
    const nowMs = Date.now();
    lastObservedRef.current = nowMs;
    setClockMs(nowMs);
    publish({
      ...current, status: "running", runningSince: new Date(nowMs).toISOString(),
      updatedAt: new Date(nowMs).toISOString(),
    });
  }, [publish]);

  const toggle = useCallback(() => {
    if (snapshotRef.current.status === "running") pause();
    else if (snapshotRef.current.status === "paused") resume();
  }, [pause, resume]);

  const finish = useCallback(() => {
    const atMs = activeClockBoundary(lastObservedRef.current, Date.now());
    const current = snapshotRef.current;
    setClockMs(atMs);
    publish({
      ...current, status: "complete", runningSince: null,
      elapsedBeforeRunMs: elapsedTimerMs(current, atMs),
      updatedAt: new Date(atMs).toISOString(),
    });
  }, [publish]);

  const reset = useCallback((override?: number) => {
    setClockMs(Date.now());
    publish(recoverSessionTimer(null, override ?? durationMinutes));
  }, [durationMinutes, publish]);

  return useMemo(() => ({
    snapshot, status: snapshot.status, elapsedMs, remainingMs, overtimeMs,
    progress: Math.min(100, (elapsedMs / snapshot.durationMs) * 100), expired,
    display: expired ? "+" + formatSessionTime(overtimeMs) : formatSessionTime(remainingMs),
    start, pause, resume, toggle, finish, reset,
  }), [elapsedMs, expired, finish, overtimeMs, pause, remainingMs, reset,
    resume, snapshot, start, toggle]);
}
