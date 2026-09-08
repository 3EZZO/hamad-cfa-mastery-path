import { afterEach, describe, expect, it, vi } from "vitest";
import { createDefaultState, loadPendingSync, loadState, normalizeState, PENDING_SYNC_KEY, STORAGE_KEY } from "./storage";
import { migrateSeptemberSchedule, PRE_RESCHEDULE_BACKUP_KEY } from "./scheduleMigration";
import { mergeTrackerStates } from "./stateMerge";
import { validateEffectiveSessionSchedule } from "./schedule";

function legacy() {
  return {
    ...createDefaultState(), scheduleVersion: "weekly-saturday-v2",
    updatedAt: "2026-09-01T06:00:00.000Z",
    taskCompletions: {
      "w1-independent-1": true, "w1-session-1": true,
      "w19-session-1": true, "w20-session-1": true,
      "w19-evidence-gate": true, "w20-evidence-gate": false,
      "w20-independent-1": true, "w21-independent-1": true,
      "w25-independent-3": true, "w26-independent-1": true,
    },
    sessionOverrides: {
      "1": { sessionNumber: 1, date: "2026-09-04", reason: "Old appointment", updatedAt: "2026-09-01T06:00:00.000Z" },
      "2": { sessionNumber: 2, date: "2026-09-11", reason: "Friday", updatedAt: "2026-09-01T06:00:00.000Z" },
      "20": { sessionNumber: 20, date: "2027-01-15", reason: "Repair", updatedAt: "2026-09-01T06:00:00.000Z" },
      "25": { sessionNumber: 25, date: "2027-02-19", reason: "Friday final", updatedAt: "2026-09-01T06:00:00.000Z" },
    },
    sessionLogs: [19, 20, 25].map(number => ({
      id: `old-${number}`, sessionNumber: number, week: number,
      date: "2026-09-01", type: "Rehearsal", durationMinutes: 120,
      focus: `Checkpoint ${number}`, outcome: "Keep actual history", nextAction: "Review",
    })),
    mockScores: [3, 4, 5, 6, 7].map(number => ({
      id: `m${number}`, date: "2026-09-01", label: `Mock ${number}`,
      score: 70, note: "Preserved", milestoneWeek: number + 18,
    })),
  };
}

afterEach(() => vi.unstubAllGlobals());

describe("12 September schedule migration", () => {
  it("is deterministic, idempotent and does not mutate input", () => {
    const old = legacy();
    const before = JSON.stringify(old);
    const migrated = normalizeState(old);
    expect(JSON.stringify(old)).toBe(before);
    expect(normalizeState(migrated)).toEqual(migrated);
    expect(normalizeState(old)).toEqual(migrated);
    expect(migrated.scheduleVersion).toBe("weekly-saturday-v3");
  });

  it("retains original task evidence without falsely approving combined or larger assignments", () => {
    const current = normalizeState(legacy());
    expect(current.taskCompletions["w1-session-1"]).toBe(true);
    expect(current.taskCompletions["w19-session-1"]).toBeUndefined();
    expect(current.taskCompletions["w19-evidence-gate"]).toBeUndefined();
    expect(current.taskCompletions["legacy-v2-w20-session-1"]).toBe(true);
    expect(current.taskCompletions["w19-independent-5"]).toBe(true);
    expect(current.taskCompletions["w20-independent-1"]).toBe(true);
    expect(current.taskCompletions["w25-independent-1"]).toBe(true);
    expect(current.taskCompletions["w24-independent-3"]).toBeUndefined();
    expect(current.taskCompletions["legacy-v2-w25-independent-3"]).toBe(true);
  });

  it("requires both previous evidence gates before carrying combined completion", () => {
    const old = legacy();
    old.taskCompletions["w20-evidence-gate"] = true;
    expect(normalizeState(old).taskCompletions["w19-evidence-gate"]).toBe(true);
  });

  it("keeps all 25 approval pairs archived and active pairs consistently mapped", () => {
    const requests = Object.fromEntries(Array.from({length:25}, (_, i) => [`w${i+1}-session-1`, {taskId:`w${i+1}-session-1`,requestedAt:"2026-09-01T06:00:00.000Z"}]));
    const reviews = Object.fromEntries(Object.entries(requests).map(([key, item]) => [key, {...item, status:"approved", reviewedAt:"2026-09-01T07:00:00.000Z",note:"Historical proof"}]));
    const current = normalizeState({...legacy(),sessionCompletionRequests:requests,sessionCompletionReviews:reviews});
    expect(Object.keys(current.sessionCompletionRequests)).toHaveLength(48);
    expect(Object.keys(current.sessionCompletionReviews)).toHaveLength(48);
    expect(current.sessionCompletionReviews["w19-session-1"]).toBeUndefined();
    expect(current.sessionCompletionReviews["legacy-v2-w20-session-1"]?.status).toBe("approved");
    expect(current.sessionCompletionRequests["w24-session-1"]?.requestedAt).toBe(current.sessionCompletionReviews["w24-session-1"]?.requestedAt);
  });

  it("moves Friday exceptions with their sessions and audits superseded exceptions", () => {
    const current = normalizeState(legacy());
    expect(current.sessionOverrides["1"]).toBeUndefined();
    expect(current.sessionOverrides["2"]?.date).toBe("2026-09-18");
    expect(current.sessionOverrides["24"]?.date).toBe("2027-02-19");
    expect(current.sessionOverrides["20"]).toBeUndefined();
    expect(current.notes).toHaveLength(4);
    expect(current.notes.find(note=>note.id==="schedule-v2-override-1")?.body).toContain("2026-09-04");
    expect(()=>validateEffectiveSessionSchedule(current.sessionOverrides)).not.toThrow();
  });

  it("preserves actual session history and attaches mock scores to the correct new weeks", () => {
    const current = normalizeState(legacy());
    expect(current.sessionLogs.map(log=>log.sessionNumber)).toEqual([19,19,24]);
    expect(current.sessionLogs.map(log=>log.id)).toEqual(["old-19","old-20","old-25"]);
    expect(current.sessionLogs.every(log=>log.date==="2026-09-01")).toBe(true);
    expect(current.mockScores.map(mock=>mock.milestoneWeek)).toEqual([20,21,22,23,24]);
  });

  it("preserves original local and pending snapshots without dropping the queued mutation", () => {
    const old = legacy();
    const pending = {version:1,baseRevision:7,baseState:old,localState:old,mutationId:"keep-me",queuedAt:old.updatedAt};
    const values = new Map([[STORAGE_KEY, JSON.stringify(old)],[PENDING_SYNC_KEY,JSON.stringify(pending)]]);
    vi.stubGlobal("window",{localStorage:{getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>values.set(key,value),removeItem:(key:string)=>values.delete(key)}});
    expect(loadState().taskCompletions["w1-independent-1"]).toBe(true);
    expect(loadPendingSync()?.mutationId).toBe("keep-me");
    expect(loadPendingSync()?.baseState.scheduleVersion).toBe("weekly-saturday-v3");
    expect(values.get(`${PRE_RESCHEDULE_BACKUP_KEY}-local`)).toBe(JSON.stringify(old));
    expect(values.get(`${PRE_RESCHEDULE_BACKUP_KEY}-pending`)).toBe(JSON.stringify(pending));
    expect(values.has(PENDING_SYNC_KEY)).toBe(true);
  });

  it("merges migrated concurrent evidence without repeating migration or losing either change", () => {
    const old = legacy();
    const local = normalizeState({...old,taskCompletions:{...old.taskCompletions,"w2-independent-1":true}});
    const remote = normalizeState({...old,taskCompletions:{...old.taskCompletions,"w3-independent-1":true}});
    const merged = mergeTrackerStates(normalizeState(old), local, remote);
    expect(merged.taskCompletions["w2-independent-1"]).toBe(true);
    expect(merged.taskCompletions["w3-independent-1"]).toBe(true);
    expect(merged.notes).toHaveLength(4);
    expect(migrateSeptemberSchedule({...merged})).toEqual(merged);
  });
});
