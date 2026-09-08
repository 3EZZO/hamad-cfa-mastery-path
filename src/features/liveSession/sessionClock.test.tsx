import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { LiveSessionRunSnapshot, SessionTimerSnapshot } from "./types";
import {
  activeClockBoundary, elapsedTimerMs, MAX_SESSION_ELAPSED_MS,
  pauseSessionTimer, recordedSessionElapsedMs,
  recoverLiveSessionClock, recoverSessionTimer,
} from "./sessionClock";
import { useSessionTimer } from "./useSessionTimer";

const START = Date.parse("2026-09-02T06:00:00Z");
const SAVED = START + 20 * 60_000;
const REOPENED = Date.parse("2026-09-08T07:00:00Z");
const iso = (ms: number) => new Date(ms).toISOString();

function timer(overrides: Partial<SessionTimerSnapshot> = {}): SessionTimerSnapshot {
  return {
    status: "running", durationMs: 150 * 60_000, runningSince: iso(START),
    elapsedBeforeRunMs: 0, updatedAt: iso(START), ...overrides,
  };
}

function run(overrides: Partial<LiveSessionRunSnapshot> = {}): LiveSessionRunSnapshot {
  return {
    phase: "running", routeId: "standard", stageIndex: 1, questionIndex: 16,
    evidence: [{ id: "proof-kept", stageId: "returns", targetId: "q1",
      targetLabel: "Return", verdict: "correct", confidence: 5, errorCodes: [],
      note: "Keep this note", recordedAt: iso(SAVED) }],
    completedDeskIds: Array.from({ length: 16 }, (_, i) => `returns::q${i}`),
    timer: timer(), updatedAt: iso(SAVED), ...overrides,
  };
}

afterEach(() => vi.useRealTimers());

describe("Session Mode clock recovery", () => {
  it("excludes the six days before reopening and restores a paused 20-minute checkpoint", () => {
    const recovered = recoverSessionTimer(timer(), 150, iso(SAVED), REOPENED);
    expect(recovered.status).toBe("paused");
    expect(recovered.runningSince).toBeNull();
    expect(recovered.elapsedBeforeRunMs).toBe(20 * 60_000);
    expect(elapsedTimerMs(recovered, REOPENED + 999_000)).toBe(20 * 60_000);
  });

  it("does not add absence to the cloud action's already-accumulated time", () => {
    const cloudTimer = timer({ runningSince: iso(SAVED), updatedAt: iso(SAVED),
      elapsedBeforeRunMs: 20 * 60_000 });
    expect(recoverSessionTimer(cloudTimer, 150, iso(SAVED), REOPENED)
      .elapsedBeforeRunMs).toBe(20 * 60_000);
  });

  it("replays a queued action at its capture time, independent of today's date", () => {
    vi.useFakeTimers();
    vi.setSystemTime(REOPENED);
    expect(recordedSessionElapsedMs(run())).toBe(20 * 60_000);
    vi.setSystemTime(REOPENED + 30 * 86_400_000);
    expect(recordedSessionElapsedMs(run())).toBe(20 * 60_000);
  });

  it("recovers an already-inflated browser timer from the cloud floor, without losing any teaching data", () => {
    const local = run({ timer: timer({ status: "paused", runningSince: null,
      elapsedBeforeRunMs: 144 * 60 * 60_000 }), updatedAt: iso(REOPENED) });
    const before = JSON.stringify(local);
    const restored = recoverLiveSessionClock(local, 150, run());
    expect(restored?.timer?.elapsedBeforeRunMs).toBe(20 * 60_000);
    expect(restored?.stageIndex).toBe(1);
    expect(restored?.questionIndex).toBe(16);
    expect(restored?.completedDeskIds).toHaveLength(16);
    expect(restored?.evidence).toEqual(local.evidence);
    expect(JSON.stringify(local)).toBe(before);
  });

  it("retains a valid base if an old running checkpoint included days of idle time", () => {
    const old = run({ timer: timer({ elapsedBeforeRunMs: 12 * 60_000 }),
      updatedAt: iso(REOPENED) });
    expect(recordedSessionElapsedMs(old)).toBe(12 * 60_000);
  });

  it("keeps paused and completed records stopped and preserves real overtime", () => {
    for (const status of ["paused", "complete"] as const) {
      const restored = recoverSessionTimer(timer({ status, runningSince: null,
        elapsedBeforeRunMs: 160 * 60_000 }), 150, iso(SAVED), REOPENED);
      expect(restored.status).toBe(status);
      expect(restored.elapsedBeforeRunMs - restored.durationMs).toBe(10 * 60_000);
    }
  });

  it("pauses at the last observed tick after sleep or a backwards clock change", () => {
    expect(activeClockBoundary(SAVED, REOPENED)).toBe(SAVED);
    expect(activeClockBoundary(SAVED, SAVED - 60_000)).toBe(SAVED);
    expect(activeClockBoundary(SAVED, SAVED + 250)).toBe(SAVED + 250);
    const paused = pauseSessionTimer(timer(), activeClockBoundary(SAVED, REOPENED));
    expect(paused.elapsedBeforeRunMs).toBe(20 * 60_000);
  });

  it("counts uninterrupted teaching without clicks and supports pause/resume", () => {
    const paused = pauseSessionTimer(timer(), SAVED);
    const resumed = { ...paused, status: "running" as const, runningSince: iso(REOPENED) };
    expect(elapsedTimerMs(resumed, REOPENED + 5 * 60_000)).toBe(25 * 60_000);
    expect(elapsedTimerMs(timer(), START + 150 * 60_000)).toBe(150 * 60_000);
  });

  it("keeps new sessions idle at the selected 150-minute duration and tolerates corrupt timestamps", () => {
    expect(recoverSessionTimer(null, 150).durationMs).toBe(9_000_000);
    expect(recoverSessionTimer(null, 150).status).toBe("idle");
    expect(recoverSessionTimer(timer({ runningSince: "invalid", updatedAt: "invalid" }),
      150, "invalid").elapsedBeforeRunMs).toBe(0);
    expect(elapsedTimerMs(timer(), REOPENED)).toBe(MAX_SESSION_ELAPSED_MS);
  });

  it("renders the timer hook paused on its first frame, never the 141-hour overtime", () => {
    vi.useFakeTimers();
    vi.setSystemTime(REOPENED);
    function TimerProbe() {
      const clock = useSessionTimer({ durationMinutes: 150,
        initialSnapshot: timer({ runningSince: iso(SAVED), updatedAt: iso(SAVED),
          elapsedBeforeRunMs: 20 * 60_000 }) });
      return createElement("span", null, `${clock.status} ${clock.display}`);
    }
    expect(renderToStaticMarkup(createElement(TimerProbe))).toContain("paused 02:10:00");
  });
});
