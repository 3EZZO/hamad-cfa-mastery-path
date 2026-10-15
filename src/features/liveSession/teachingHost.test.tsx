import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  attachGuidedClock, parseTeachingEnvelope, reconcileHostClock, teachingRunIdFor,
  useTeachingHostClock, withHistoryEntry, type TeachingHostClock,
} from "./teachingHost";
import type { SessionTimerSnapshot } from "./types";

const T0 = Date.parse("2026-10-17T06:00:00Z");
const iso = (ms: number) => new Date(ms).toISOString();
const MIN = 60_000;

function clock(partial: Partial<SessionTimerSnapshot>): SessionTimerSnapshot {
  return { status: "paused", durationMs: 150 * MIN, runningSince: null, elapsedBeforeRunMs: 0, updatedAt: iso(T0), ...partial };
}

describe("host clock reconciliation rule", () => {
  it("adopts recorded time into an idle host as paused, never running", () => {
    const recorded = clock({ status: "running", runningSince: iso(T0 - 10 * MIN), elapsedBeforeRunMs: 5 * MIN, updatedAt: iso(T0 - 2 * MIN) });
    const result = reconcileHostClock(clock({ status: "idle" }), T0 + 60 * MIN, recorded, iso(T0 - 2 * MIN), 150);
    expect(result.status).toBe("paused");
    // 5 min base + 8 min evidenced up to the capture; absence after it is not teaching time.
    expect(result.elapsedBeforeRunMs).toBe(13 * MIN);
  });

  it("takes the maximum of two checkpoints of the same clock instead of summing", () => {
    const host = clock({ status: "paused", elapsedBeforeRunMs: 20 * MIN });
    expect(reconcileHostClock(host, T0, clock({ elapsedBeforeRunMs: 12 * MIN }), undefined, 150).elapsedBeforeRunMs).toBe(20 * MIN);
    expect(reconcileHostClock(host, T0, clock({ elapsedBeforeRunMs: 25 * MIN }), undefined, 150).elapsedBeforeRunMs).toBe(25 * MIN);
  });

  it("keeps a running host running and a complete host complete", () => {
    const running = clock({ status: "running", runningSince: iso(T0 - MIN), elapsedBeforeRunMs: 0 });
    const result = reconcileHostClock(running, T0, clock({ elapsedBeforeRunMs: 30 * MIN }), undefined, 150);
    expect(result.status).toBe("running");
    expect(result.elapsedBeforeRunMs).toBe(30 * MIN);
    expect(result.runningSince).toBe(iso(T0));
    expect(reconcileHostClock(clock({ status: "complete", elapsedBeforeRunMs: 90 * MIN }), T0, clock({ elapsedBeforeRunMs: MIN }), undefined, 150).status).toBe("complete");
    expect(reconcileHostClock(running, T0, null, undefined, 150)).toBe(running);
  });
});

describe("attaching guided content to the host clock", () => {
  it("starts an idle clock exactly like the original guided Start", () => {
    const result = attachGuidedClock(clock({ status: "idle" }), T0, 120);
    expect(result).toMatchObject({ status: "running", elapsedBeforeRunMs: 0, durationMs: 120 * MIN, runningSince: iso(T0) });
  });

  it("keeps PDF teaching time and the paused/running state", () => {
    const paused = clock({ status: "paused", elapsedBeforeRunMs: 17 * MIN });
    expect(attachGuidedClock(paused, T0, 120)).toMatchObject({ status: "paused", elapsedBeforeRunMs: 17 * MIN, durationMs: 120 * MIN });
    const running = clock({ status: "running", runningSince: iso(T0 - MIN), elapsedBeforeRunMs: 4 * MIN });
    expect(attachGuidedClock(running, T0, 150)).toBe(running);
  });
});

describe("teaching envelope", () => {
  const valid = {
    schemaVersion: 1, ownerUid: "tutor", runId: "session-03", sessionNumber: 3, rehearsal: false, status: "paused",
    clock: clock({}), surface: "pdf", selectedVersionId: null, guidedRunId: null, history: [], revision: 2, updatedAtClient: iso(T0),
  };
  it("accepts only the owner's non-rehearsal record for this run", () => {
    expect(teachingRunIdFor(3)).toBe("session-03");
    expect(parseTeachingEnvelope("tutor", "session-03", valid)?.revision).toBe(2);
    expect(parseTeachingEnvelope("someone-else", "session-03", valid)).toBeNull();
    expect(parseTeachingEnvelope("tutor", "session-04", valid)).toBeNull();
    expect(parseTeachingEnvelope("tutor", "session-03", { ...valid, rehearsal: true })).toBeNull();
    expect(parseTeachingEnvelope("tutor", "session-03", { ...valid, clock: { ...valid.clock, elapsedBeforeRunMs: -1 } })).toBeNull();
  });
  it("records each PDF once in the private history", () => {
    const once = withHistoryEntry([], "v1", iso(T0));
    expect(withHistoryEntry(once, "v1", iso(T0 + MIN))).toBe(once);
    expect(withHistoryEntry(once, "v2", iso(T0 + MIN))).toHaveLength(2);
  });
});

describe("useTeachingHostClock", () => {
  let tree: ReactTestRenderer | undefined;
  let host: TeachingHostClock;
  const listeners: Record<string, Array<() => void>> = {};
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(T0);
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    vi.stubGlobal("window", {
      addEventListener: (name: string, fn: () => void) => { (listeners[name] ??= []).push(fn); },
      removeEventListener: vi.fn(), setInterval, clearInterval, setTimeout, clearTimeout,
    });
    vi.stubGlobal("document", { hidden: false, addEventListener: vi.fn(), removeEventListener: vi.fn() });
  });
  afterEach(async () => {
    if (tree) await act(async () => tree!.unmount());
    tree = undefined;
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  function Harness({ active }: { active: boolean }) {
    host = useTeachingHostClock({ durationMinutes: 150, active });
    return null;
  }

  it("is one clock: PDF time survives a later guided attach, and listeners see every change", async () => {
    await act(async () => { tree = create(<Harness active />); });
    const seen: string[] = [];
    let unsubscribe = () => {};
    await act(async () => { unsubscribe = host.subscribe(snapshot => seen.push(snapshot.status)); });
    expect(seen).toEqual(["idle"]);
    await act(async () => host.timer.start(150));
    await act(async () => { vi.advanceTimersByTime(10 * MIN); });
    await act(async () => host.attachGuided(120));
    expect(host.timer.current().status).toBe("running");
    expect(host.timer.elapsedMs).toBeGreaterThanOrEqual(10 * MIN - 1_000);
    await act(async () => host.timer.pause());
    const paused = host.timer.current().elapsedBeforeRunMs;
    await act(async () => host.attachGuided(150));
    expect(host.timer.current()).toMatchObject({ status: "paused", elapsedBeforeRunMs: paused });
    expect(seen).toContain("running");
    expect(seen.at(-1)).toBe("paused");
    unsubscribe();
  });

  it("pauses when its scheduled session is no longer selected", async () => {
    await act(async () => { tree = create(<Harness active />); });
    await act(async () => host.timer.start(150));
    await act(async () => tree!.update(<Harness active={false} />));
    expect(host.timer.current().status).toBe("paused");
  });
});
