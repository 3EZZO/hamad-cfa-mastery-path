import { afterEach, describe, expect, it, vi } from "vitest";
import { createDefaultState, loadPendingSync, loadState, normalizeState, PENDING_SYNC_KEY, STORAGE_KEY } from "./storage";
import { migrateSeptemberSchedule, PRE_RESCHEDULE_BACKUP_KEY } from "./scheduleMigration";
import { validateEffectiveSessionSchedule } from "./schedule";

function v3() {
  return {
    ...createDefaultState(), scheduleVersion: "weekly-saturday-v3",
    updatedAt: "2026-09-12T06:00:00.000Z",
    taskCompletions: {
      "w1-independent-1": true, "w22-session-1": true,
      "w23-session-1": true, "w25-independent-1": true,
    },
    sessionOverrides: {
      "2": { sessionNumber: 2, date: "2026-09-18", reason: "Previous Friday exception", updatedAt: "2026-09-01T06:00:00.000Z" },
    },
    sessionLogs: [{
      id: "actual-session", sessionNumber: 1, week: 1, date: "2026-09-12",
      type: "Tutor session", durationMinutes: 60, focus: "Historical record",
      outcome: "Preserve", nextAction: "Continue",
    }],
    mockScores: [{ id: "mock-1", date: "2027-01-16", label: "Mock 1", score: 65, note: "Preserve", milestoneWeek: 18 }],
  };
}

afterEach(() => vi.unstubAllGlobals());

describe("18 September schedule migration", () => {
  it("is deterministic, idempotent, and preserves the input", () => {
    const old = v3();
    const before = JSON.stringify(old);
    const migrated = normalizeState(old);
    expect(JSON.stringify(old)).toBe(before);
    expect(migrated.scheduleVersion).toBe("weekly-saturday-v4");
    expect(normalizeState(migrated)).toEqual(migrated);
    expect(migrateSeptemberSchedule({ ...migrated })).toEqual(migrated);
  });

  it("moves safe evidence one week while archiving changed final-review work", () => {
    const current = normalizeState(v3());
    expect(current.taskCompletions["w2-independent-1"]).toBe(true);
    expect(current.taskCompletions["w23-session-1"]).toBe(true);
    expect(current.taskCompletions["w24-session-1"]).toBeUndefined();
    expect(current.taskCompletions["legacy-v3-w23-session-1"]).toBe(true);
    expect(current.taskCompletions["w25-independent-1"]).toBe(true);
  });

  it("audits superseded overrides and keeps actual history", () => {
    const current = normalizeState(v3());
    expect(current.sessionOverrides).toEqual({});
    expect(current.notes.find(note => note.id === "schedule-v3-override-2")?.body).toContain("Previous Friday exception");
    expect(current.sessionLogs[0]).toMatchObject({ id: "actual-session", sessionNumber: 1, date: "2026-09-12" });
    expect(current.mockScores[0]?.milestoneWeek).toBe(19);
    expect(() => validateEffectiveSessionSchedule(current.sessionOverrides)).not.toThrow();
  });

  it("also upgrades v2 snapshots through both migrations", () => {
    const current = normalizeState({ ...v3(), scheduleVersion: "weekly-saturday-v2" });
    expect(current.scheduleVersion).toBe("weekly-saturday-v4");
    expect(current.taskCompletions).toHaveProperty("legacy-v3-legacy-v2-w1-independent-1");
  });

  it("preserves local and pending recovery copies without dropping the queue", () => {
    const old = v3();
    const pending = { version: 1, baseRevision: 7, baseState: old, localState: old, mutationId: "keep-me", queuedAt: old.updatedAt };
    const values = new Map([[STORAGE_KEY, JSON.stringify(old)], [PENDING_SYNC_KEY, JSON.stringify(pending)]]);
    vi.stubGlobal("window", { localStorage: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
    }});
    expect(loadState().taskCompletions["w2-independent-1"]).toBe(true);
    expect(loadPendingSync()?.mutationId).toBe("keep-me");
    expect(loadPendingSync()?.baseState.scheduleVersion).toBe("weekly-saturday-v4");
    expect(values.has(`${PRE_RESCHEDULE_BACKUP_KEY}-local`)).toBe(true);
    expect(values.has(`${PRE_RESCHEDULE_BACKUP_KEY}-pending`)).toBe(true);
  });
});
