import { useCallback, useEffect, useMemo, useRef } from "react";
import type { SessionTimerSnapshot } from "./types";
import {
  elapsedTimerMs, MAX_SESSION_ELAPSED_MS, recoverSessionTimer,
} from "./sessionClock";
import { useSessionTimer, type SessionTimerController } from "./useSessionTimer";

/**
 * Session teaching host: one canonical clock per scheduled session, shared by
 * the Guided Session surface and the Teach-from-PDF surface.
 *
 * Ownership. The host (one per mounted session workspace) owns the only
 * ticking `useSessionTimer`. The guided workspace no longer starts its own
 * clock; it mirrors the host snapshot into its run snapshot once a guided
 * run is attached, so the guided record is a checkpoint of the host clock,
 * never a second authority.
 *
 * Reconciliation rule (adoption of a recorded checkpoint — the guided run's
 * recovered timer, the tutor teaching envelope or the device checkpoint):
 *   1. Recorded time is recovered with `recoverSessionTimer`: only elapsed
 *      time evidenced at capture counts, the result is never running, and the
 *      8-hour bound applies. Absence is never teaching time.
 *   2. Elapsed = max(host elapsed now, recovered elapsed). Checkpoints of the
 *      same clock are never summed, so two copies cannot double-count.
 *   3. A running or paused host keeps its state; an idle host takes the
 *      recovered state (paused, or complete after a guided closeout).
 *   4. A complete host stays complete.
 *
 * Attaching guided content (first Guided start after PDF teaching) keeps the
 * host clock's elapsed time and running/paused state; only an idle clock is
 * started, matching the original guided Start behaviour.
 */

export type TeachingSurface = "guided" | "pdf";
export type TeachingLifecycle = "idle" | "teaching" | "paused" | "finished";

export const MAX_TEACHING_HISTORY = 50;
export const TEACHING_ENVELOPE_SCHEMA = 1;

export interface TeachingHistoryEntry {
  versionId: string;
  firstOpenedAtClient: string;
}

/** Tutor-owned record at tutorTeachingSessions/{uid}/runs/{runId}. */
export interface TeachingSessionEnvelope {
  schemaVersion: typeof TEACHING_ENVELOPE_SCHEMA;
  ownerUid: string;
  runId: string;
  sessionNumber: number;
  rehearsal: false;
  status: TeachingLifecycle;
  clock: SessionTimerSnapshot;
  surface: TeachingSurface;
  selectedVersionId: string | null;
  guidedRunId: string | null;
  history: TeachingHistoryEntry[];
  revision: number;
  updatedAtClient: string;
}

export function teachingRunIdFor(sessionNumber: number): string {
  if (!Number.isInteger(sessionNumber) || sessionNumber < 1 || sessionNumber > 25) {
    throw new Error("Invalid session number.");
  }
  return `session-${String(sessionNumber).padStart(2, "0")}`;
}

function isIso(value: unknown): value is string {
  return typeof value === "string" && value.length <= 40 && Number.isFinite(Date.parse(value));
}

export function sanitizeClockSnapshot(value: unknown): SessionTimerSnapshot | null {
  if (typeof value !== "object" || value === null) return null;
  const clock = value as Record<string, unknown>;
  if (!["idle", "running", "paused", "complete"].includes(clock.status as string)) return null;
  const durationMs = Number(clock.durationMs);
  const elapsed = Number(clock.elapsedBeforeRunMs);
  if (!Number.isFinite(durationMs) || durationMs < 60_000 || durationMs > MAX_SESSION_ELAPSED_MS) return null;
  if (!Number.isFinite(elapsed) || elapsed < 0 || elapsed > MAX_SESSION_ELAPSED_MS) return null;
  if (!isIso(clock.updatedAt)) return null;
  const runningSince = clock.runningSince === null ? null : isIso(clock.runningSince) ? clock.runningSince : undefined;
  if (runningSince === undefined) return null;
  if (clock.status === "running" && runningSince === null) return null;
  return {
    status: clock.status as SessionTimerSnapshot["status"],
    durationMs: Math.round(durationMs),
    elapsedBeforeRunMs: Math.round(elapsed),
    runningSince,
    updatedAt: clock.updatedAt,
  };
}

export function parseTeachingEnvelope(ownerUid: string, runId: string, value: unknown): TeachingSessionEnvelope | null {
  if (typeof value !== "object" || value === null) return null;
  const record = value as Record<string, unknown>;
  const clock = sanitizeClockSnapshot(record.clock);
  const revision = Number(record.revision);
  if (
    record.schemaVersion !== TEACHING_ENVELOPE_SCHEMA || record.ownerUid !== ownerUid || record.runId !== runId
    || record.rehearsal !== false || !clock || !Number.isSafeInteger(revision) || revision < 1
    || !["idle", "teaching", "paused", "finished"].includes(record.status as string)
    || (record.surface !== "guided" && record.surface !== "pdf") || !isIso(record.updatedAtClient)
  ) return null;
  const history = Array.isArray(record.history)
    ? record.history.filter((entry): entry is TeachingHistoryEntry =>
      typeof entry === "object" && entry !== null
        && typeof (entry as TeachingHistoryEntry).versionId === "string"
        && isIso((entry as TeachingHistoryEntry).firstOpenedAtClient)).slice(0, MAX_TEACHING_HISTORY)
    : [];
  return {
    schemaVersion: TEACHING_ENVELOPE_SCHEMA,
    ownerUid,
    runId,
    sessionNumber: Number(record.sessionNumber),
    rehearsal: false,
    status: record.status as TeachingLifecycle,
    clock,
    surface: record.surface,
    selectedVersionId: typeof record.selectedVersionId === "string" ? record.selectedVersionId : null,
    guidedRunId: typeof record.guidedRunId === "string" ? record.guidedRunId : null,
    history,
    revision,
    updatedAtClient: record.updatedAtClient,
  };
}

/** Adds a PDF to the private teaching history once (first opening wins). */
export function withHistoryEntry(history: TeachingHistoryEntry[], versionId: string, atIso: string): TeachingHistoryEntry[] {
  if (history.some(entry => entry.versionId === versionId)) return history;
  return [...history, { versionId, firstOpenedAtClient: atIso }].slice(-MAX_TEACHING_HISTORY);
}

/** See the reconciliation rule above. Pure; `nowMs` is the adoption time. */
export function reconcileHostClock(
  current: SessionTimerSnapshot,
  nowMs: number,
  incoming: SessionTimerSnapshot | null | undefined,
  capturedAt: string | undefined,
  durationMinutes: number,
): SessionTimerSnapshot {
  if (!incoming) return current;
  const recovered = recoverSessionTimer(incoming, Math.max(1, Math.round(incoming.durationMs / 60_000)) || durationMinutes, capturedAt, nowMs);
  const floor = Math.min(MAX_SESSION_ELAPSED_MS, Math.max(elapsedTimerMs(current, nowMs), recovered.elapsedBeforeRunMs));
  const at = new Date(nowMs).toISOString();
  switch (current.status) {
    case "running":
      return { ...current, elapsedBeforeRunMs: floor, runningSince: at, updatedAt: at };
    case "paused":
      return floor === current.elapsedBeforeRunMs ? current : { ...current, elapsedBeforeRunMs: floor, updatedAt: at };
    case "complete":
      return floor === current.elapsedBeforeRunMs ? current : { ...current, elapsedBeforeRunMs: floor };
    default:
      return recovered.status === "idle" ? current : { ...recovered, elapsedBeforeRunMs: floor, updatedAt: at };
  }
}

/** Duration change on attach; idle clocks start, others keep their state. */
export function attachGuidedClock(
  current: SessionTimerSnapshot,
  nowMs: number,
  durationMinutes: number,
): SessionTimerSnapshot {
  const durationMs = Math.max(1, durationMinutes) * 60_000;
  if (current.status === "idle") {
    const at = new Date(nowMs).toISOString();
    return { status: "running", durationMs, runningSince: at, elapsedBeforeRunMs: 0, updatedAt: at };
  }
  return current.durationMs === durationMs ? current : { ...current, durationMs };
}

export type HostClockListener = (snapshot: SessionTimerSnapshot) => void;

export interface TeachingHostClock {
  timer: SessionTimerController;
  /** Synchronous snapshot listener; called once immediately on subscribe. */
  subscribe: (listener: HostClockListener) => () => void;
  attachGuided: (durationMinutes: number) => void;
  adopt: (incoming: SessionTimerSnapshot | null | undefined, capturedAt?: string) => void;
  reset: () => void;
}

export function useTeachingHostClock({
  durationMinutes,
  active,
  initialSnapshot,
}: {
  durationMinutes: number;
  active: boolean;
  /** Already-recovered snapshot (never running); later sources use adopt(). */
  initialSnapshot?: SessionTimerSnapshot | null;
}): TeachingHostClock {
  const listenersRef = useRef(new Set<HostClockListener>());
  const notify = useCallback((snapshot: SessionTimerSnapshot) => {
    // Synchronous fan-out so pagehide/unmount pauses reach every recorder.
    listenersRef.current.forEach(listener => listener(snapshot));
  }, []);
  const timer = useSessionTimer({ durationMinutes, initialSnapshot, onSnapshotChange: notify });
  const { status, pause, current, replace, reset: resetTimer } = timer;

  // Switching to another scheduled session pauses this one.
  useEffect(() => {
    if (!active && status === "running") pause();
  }, [active, pause, status]);

  const subscribe = useCallback((listener: HostClockListener) => {
    listenersRef.current.add(listener);
    listener(current());
    return () => { listenersRef.current.delete(listener); };
  }, [current]);

  const attachGuided = useCallback((minutes: number) => {
    const before = current();
    const next = attachGuidedClock(before, Date.now(), minutes);
    if (next !== before) replace(next);
  }, [current, replace]);

  const adopt = useCallback((incoming: SessionTimerSnapshot | null | undefined, capturedAt?: string) => {
    const before = current();
    const next = reconcileHostClock(before, Date.now(), incoming, capturedAt, durationMinutes);
    if (next !== before) replace(next);
  }, [current, durationMinutes, replace]);

  const reset = useCallback(() => resetTimer(), [resetTimer]);

  return useMemo(() => ({ timer, subscribe, attachGuided, adopt, reset }), [adopt, attachGuided, reset, subscribe, timer]);
}
