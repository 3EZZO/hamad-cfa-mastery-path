import type { LiveSessionRunSnapshot, SessionTimerSnapshot } from "./types";

// Matches the private live-run contract. Time outside Session Mode is not
// teaching time and must never be added when a saved run is reopened/replayed.
export const MAX_SESSION_ELAPSED_MS = 8 * 60 * 60 * 1_000;
export const CLOCK_SUSPENSION_GAP_MS = 15_000;
export const CLOCK_CHECKPOINT_MS = 30_000;

function validMs(value: string | null | undefined): number | null {
  const parsed = value ? Date.parse(value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

export function boundedElapsedMs(value: number): number {
  return Number.isFinite(value)
    ? Math.max(0, Math.min(MAX_SESSION_ELAPSED_MS, value))
    : 0;
}

export function elapsedTimerMs(timer: SessionTimerSnapshot, atMs: number): number {
  const start = validMs(timer.runningSince);
  const delta = timer.status === "running" && start !== null
    ? Math.max(0, atMs - start)
    : 0;
  return boundedElapsedMs(timer.elapsedBeforeRunMs + delta);
}

/** Recover only time evidenced at capture, never the wall clock at replay. */
export function recordedSessionElapsedMs(
  snapshot: Pick<LiveSessionRunSnapshot, "timer" | "updatedAt">,
): number {
  const timer = snapshot.timer;
  if (!timer) return 0;
  const base = Number.isFinite(timer.elapsedBeforeRunMs)
    && timer.elapsedBeforeRunMs >= 0
    && timer.elapsedBeforeRunMs <= MAX_SESSION_ELAPSED_MS
    ? timer.elapsedBeforeRunMs : 0;
  const captured = validMs(snapshot.updatedAt) ?? validMs(timer.updatedAt);
  const start = validMs(timer.runningSince);
  const delta = timer.status === "running" && captured !== null && start !== null
    ? Math.max(0, captured - start) : 0;
  // Old clients can have checkpointed days of absence. Retain the known
  // active-time base in that case instead of converting it to an 8-hour lesson.
  return base + delta <= MAX_SESSION_ELAPSED_MS ? base + delta : base;
}

export function recoverSessionTimer(
  timer: SessionTimerSnapshot | null | undefined,
  durationMinutes: number,
  capturedAt?: string,
  nowMs = Date.now(),
): SessionTimerSnapshot {
  const durationMs = Math.max(1, durationMinutes) * 60_000;
  if (!timer) return {
    status: "idle", durationMs, runningSince: null,
    elapsedBeforeRunMs: 0, updatedAt: new Date(nowMs).toISOString(),
  };
  return {
    ...timer,
    status: timer.status === "complete" ? "complete"
      : timer.status === "idle" ? "idle" : "paused",
    durationMs,
    runningSince: null,
    elapsedBeforeRunMs: recordedSessionElapsedMs({
      timer, updatedAt: capturedAt ?? timer.updatedAt,
    }),
    updatedAt: new Date(nowMs).toISOString(),
  };
}

export function pauseSessionTimer(
  timer: SessionTimerSnapshot,
  atMs: number,
): SessionTimerSnapshot {
  if (timer.status !== "running") return timer;
  return {
    ...timer, status: "paused", runningSince: null,
    elapsedBeforeRunMs: elapsedTimerMs(timer, atMs),
    updatedAt: new Date(atMs).toISOString(),
  };
}

export function recoverLiveSessionClock(
  snapshot: LiveSessionRunSnapshot | null,
  durationMinutes: number,
  cloudSnapshot: LiveSessionRunSnapshot | null = null,
): LiveSessionRunSnapshot | null {
  if (!snapshot) return null;
  const timer = recoverSessionTimer(snapshot.timer, durationMinutes, snapshot.updatedAt);
  // A valid cloud checkpoint is the floor if an old browser already wrote an
  // inflated local clock. Nothing else in the newer device draft is replaced.
  timer.elapsedBeforeRunMs = Math.max(
    timer.elapsedBeforeRunMs,
    cloudSnapshot ? recordedSessionElapsedMs(cloudSnapshot) : 0,
  );
  return { ...snapshot, timer };
}

/** A sleeping laptop must stop at the last observed tick, not after waking. */
export function activeClockBoundary(lastTickMs: number, nowMs: number): number {
  return nowMs - lastTickMs > CLOCK_SUSPENSION_GAP_MS || nowMs < lastTickMs
    ? lastTickMs : nowMs;
}
