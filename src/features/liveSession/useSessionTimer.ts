import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { SessionTimerSnapshot } from "./types";

const SECOND_MS = 1_000;

function nowIso(): string {
  return new Date().toISOString();
}

function safeDateMs(value: string | null): number | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function createTimerSnapshot(durationMinutes: number): SessionTimerSnapshot {
  return {
    status: "idle",
    durationMs: Math.max(1, durationMinutes) * 60 * SECOND_MS,
    runningSince: null,
    elapsedBeforeRunMs: 0,
    updatedAt: nowIso(),
  };
}

function normalizeSnapshot(
  value: SessionTimerSnapshot | null | undefined,
  durationMinutes: number,
): SessionTimerSnapshot {
  if (!value) return createTimerSnapshot(durationMinutes);
  const durationMs = Number.isFinite(value.durationMs)
    ? Math.max(SECOND_MS, value.durationMs)
    : Math.max(1, durationMinutes) * 60 * SECOND_MS;
  const elapsedBeforeRunMs = Number.isFinite(value.elapsedBeforeRunMs)
    ? Math.max(0, value.elapsedBeforeRunMs)
    : 0;
  const status = ["idle", "running", "paused", "complete"].includes(
    value.status,
  )
    ? value.status
    : "idle";
  return {
    status,
    durationMs,
    runningSince:
      status === "running" && safeDateMs(value.runningSince)
        ? value.runningSince
        : null,
    elapsedBeforeRunMs,
    updatedAt: safeDateMs(value.updatedAt) ? value.updatedAt : nowIso(),
  };
}

function elapsedAt(snapshot: SessionTimerSnapshot, currentMs: number): number {
  if (snapshot.status !== "running") return snapshot.elapsedBeforeRunMs;
  const runningSinceMs = safeDateMs(snapshot.runningSince);
  if (runningSinceMs === null) return snapshot.elapsedBeforeRunMs;
  return snapshot.elapsedBeforeRunMs + Math.max(0, currentMs - runningSinceMs);
}

export function formatSessionTime(milliseconds: number): string {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / SECOND_MS));
  const hours = Math.floor(totalSeconds / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;
  return hours > 0
    ? `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
    : `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
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
  durationMinutes,
  initialSnapshot,
  onSnapshotChange,
  onExpire,
}: UseSessionTimerOptions): SessionTimerController {
  const [snapshot, setSnapshot] = useState(() =>
    normalizeSnapshot(initialSnapshot, durationMinutes),
  );
  const [clockMs, setClockMs] = useState(() => Date.now());
  const expiredNotifiedRef = useRef(false);

  useEffect(() => {
    if (snapshot.status !== "running") return;
    const interval = window.setInterval(() => setClockMs(Date.now()), 250);
    return () => window.clearInterval(interval);
  }, [snapshot.status]);

  useEffect(() => {
    onSnapshotChange?.(snapshot);
  }, [onSnapshotChange, snapshot]);

  const elapsedMs = elapsedAt(snapshot, clockMs);
  const remainingMs = Math.max(0, snapshot.durationMs - elapsedMs);
  const overtimeMs = Math.max(0, elapsedMs - snapshot.durationMs);
  const expired = elapsedMs >= snapshot.durationMs;

  useEffect(() => {
    if (!expired) {
      expiredNotifiedRef.current = false;
      return;
    }
    if (!expiredNotifiedRef.current) {
      expiredNotifiedRef.current = true;
      onExpire?.();
    }
  }, [expired, onExpire]);

  const start = useCallback(
    (overrideDurationMinutes?: number) => {
      const current = nowIso();
      setClockMs(Date.now());
      setSnapshot({
        status: "running",
        durationMs:
          Math.max(1, overrideDurationMinutes ?? durationMinutes) *
          60 *
          SECOND_MS,
        runningSince: current,
        elapsedBeforeRunMs: 0,
        updatedAt: current,
      });
    },
    [durationMinutes],
  );

  const pause = useCallback(() => {
    const currentMs = Date.now();
    setClockMs(currentMs);
    setSnapshot(current => {
      if (current.status !== "running") return current;
      return {
        ...current,
        status: "paused",
        runningSince: null,
        elapsedBeforeRunMs: elapsedAt(current, currentMs),
        updatedAt: new Date(currentMs).toISOString(),
      };
    });
  }, []);

  const resume = useCallback(() => {
    const current = nowIso();
    setClockMs(Date.now());
    setSnapshot(value =>
      value.status !== "paused"
        ? value
        : {
            ...value,
            status: "running",
            runningSince: current,
            updatedAt: current,
          },
    );
  }, []);

  const toggle = useCallback(() => {
    if (snapshot.status === "running") pause();
    else if (snapshot.status === "paused") resume();
  }, [pause, resume, snapshot.status]);

  const finish = useCallback(() => {
    const currentMs = Date.now();
    setClockMs(currentMs);
    setSnapshot(current => ({
      ...current,
      status: "complete",
      runningSince: null,
      elapsedBeforeRunMs: elapsedAt(current, currentMs),
      updatedAt: new Date(currentMs).toISOString(),
    }));
  }, []);

  const reset = useCallback(
    (overrideDurationMinutes?: number) => {
      setClockMs(Date.now());
      setSnapshot(
        createTimerSnapshot(overrideDurationMinutes ?? durationMinutes),
      );
    },
    [durationMinutes],
  );

  return useMemo(
    () => ({
      snapshot,
      status: snapshot.status,
      elapsedMs,
      remainingMs,
      overtimeMs,
      progress: Math.min(100, (elapsedMs / snapshot.durationMs) * 100),
      expired,
      display: expired
        ? `+${formatSessionTime(overtimeMs)}`
        : formatSessionTime(remainingMs),
      start,
      pause,
      resume,
      toggle,
      finish,
      reset,
    }),
    [
      elapsedMs,
      expired,
      finish,
      overtimeMs,
      pause,
      remainingMs,
      reset,
      resume,
      snapshot,
      start,
      toggle,
    ],
  );
}

