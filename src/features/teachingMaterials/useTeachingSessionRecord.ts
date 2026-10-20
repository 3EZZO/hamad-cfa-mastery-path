import { useCallback, useEffect, useRef, useState } from "react";
import { MaterialServiceError, teachingMaterialService } from "../../lib/cloudTeachingMaterials";
import {
  sanitizeClockSnapshot, teachingRunIdFor, withHistoryEntry,
  type TeachingHistoryEntry, type TeachingHostClock, type TeachingLifecycle,
  type TeachingSessionEnvelope, type TeachingSurface,
} from "../liveSession/teachingHost";
import type { SessionTimerSnapshot } from "../liveSession/types";
import { mergeCoverage, sanitizeCoverage, withTaughtPage, withTeachingSeconds, type PageCoverage } from "./coverageModel";

const CLOUD_SAVE_MS = 2_000;
const CLOUD_CHECKPOINT_MS = 120_000;

interface DeviceCheckpoint {
  clock: SessionTimerSnapshot;
  surface: TeachingSurface;
  selectedVersionId: string | null;
  history: TeachingHistoryEntry[];
  coverage: PageCoverage[];
  status: TeachingLifecycle;
  savedAt: string;
}

function checkpointKey(uid: string, runId: string): string {
  return `hamad-teaching-host:${uid}:${runId}`;
}

function readCheckpoint(uid: string, runId: string): DeviceCheckpoint | null {
  try {
    const raw = localStorage.getItem(checkpointKey(uid, runId));
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<DeviceCheckpoint>;
    const clock = sanitizeClockSnapshot(value.clock);
    if (!clock) return null;
    return {
      clock,
      surface: value.surface === "pdf" ? "pdf" : "guided",
      selectedVersionId: typeof value.selectedVersionId === "string" ? value.selectedVersionId : null,
      history: Array.isArray(value.history) ? value.history.slice(0, 50) : [],
      coverage: sanitizeCoverage(value.coverage),
      status: (["idle", "teaching", "paused", "finished"] as const).includes(value.status as TeachingLifecycle) ? value.status as TeachingLifecycle : "paused",
      savedAt: typeof value.savedAt === "string" ? value.savedAt : clock.updatedAt,
    };
  } catch {
    return null;
  }
}

function writeCheckpoint(uid: string, runId: string, checkpoint: DeviceCheckpoint) {
  try {
    localStorage.setItem(checkpointKey(uid, runId), JSON.stringify(checkpoint));
  } catch {
    /* Device recovery is best effort; the cloud envelope still records it. */
  }
}

function lifecycleFor(clock: SessionTimerSnapshot, finished: boolean): TeachingLifecycle {
  if (finished) return "finished";
  return clock.status === "running" ? "teaching" : clock.status === "idle" ? "idle" : "paused";
}

function roundedClock(clock: SessionTimerSnapshot): SessionTimerSnapshot {
  return { ...clock, durationMs: Math.round(clock.durationMs), elapsedBeforeRunMs: Math.round(clock.elapsedBeforeRunMs) };
}

/**
 * The tutor-owned teaching-session envelope for one scheduled session:
 * host-clock recovery checkpoint, visible surface, selected PDF and private
 * teaching history. It is engaged once the tutor teaches from PDF — opens a
 * PDF, runs the clock on the PDF surface or finishes — or a record already
 * exists. Viewing the default PDF surface alone writes nothing, and
 * guided-only sessions behave exactly as before.
 * Rehearsal never writes it. Saves are compare-and-set per session, so a
 * pending save can never land on another session's record.
 */
export function useTeachingSessionRecord({
  tutorUid, sessionNumber, hostClock, surface, guidedRunId, rehearsal,
}: {
  tutorUid: string;
  sessionNumber: number;
  hostClock: TeachingHostClock;
  surface: TeachingSurface;
  guidedRunId: string | null;
  rehearsal: boolean;
}) {
  const runId = teachingRunIdFor(sessionNumber);
  // The host clock object changes every tick; depend only on its stable callbacks.
  const { subscribe, adopt } = hostClock;
  const { current: currentClock, pause: pauseClock } = hostClock.timer;
  const [ready, setReady] = useState(false);
  const [engaged, setEngaged] = useState(false);
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);
  const [restoredSurface, setRestoredSurface] = useState<TeachingSurface | null>(null);
  const [finished, setFinished] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [coverage, setCoverage] = useState<PageCoverage[]>([]);
  const state = useRef({
    revision: 0,
    history: [] as TeachingHistoryEntry[],
    coverage: [] as PageCoverage[],
    selectedVersionId: null as string | null,
    surface,
    guidedRunId,
    finished: false,
    engaged: false,
    rehearsal,
  });
  state.current.surface = surface;
  state.current.guidedRunId = guidedRunId;
  state.current.rehearsal = rehearsal;
  const saveTimer = useRef<number | null>(null);
  const saving = useRef(false);
  const dirty = useRef(false);
  const disposed = useRef(false);
  const lastCloud = useRef<{ status: string; at: number }>({ status: "", at: 0 });

  const checkpointNow = useCallback(() => {
    const current = state.current;
    if (!current.engaged || current.rehearsal) return;
    writeCheckpoint(tutorUid, runId, {
      clock: roundedClock(currentClock()),
      surface: current.surface,
      selectedVersionId: current.selectedVersionId,
      history: current.history,
      coverage: current.coverage,
      status: lifecycleFor(currentClock(), current.finished),
      savedAt: new Date().toISOString(),
    });
  }, [currentClock, runId, tutorUid]);

  const flushCloud = useCallback(async () => {
    if (saving.current || !dirty.current) return;
    const current = state.current;
    if (!current.engaged || current.rehearsal) return;
    saving.current = true;
    dirty.current = false;
    const service = teachingMaterialService();
    const build = (): Omit<TeachingSessionEnvelope, "revision" | "ownerUid" | "updatedAtClient"> => {
      const clock = roundedClock(currentClock());
      return {
        schemaVersion: 1, runId, sessionNumber, rehearsal: false,
        status: lifecycleFor(clock, state.current.finished), clock,
        surface: state.current.surface, selectedVersionId: state.current.selectedVersionId,
        guidedRunId: state.current.guidedRunId, history: state.current.history,
        coverage: state.current.coverage,
      };
    };
    try {
      const saved = await service.saveTeachingEnvelope(build(), current.revision, tutorUid);
      state.current.revision = saved.revision;
      setSaveError("");
    } catch (error) {
      if (error instanceof MaterialServiceError && error.code === "conflict") {
        // Another device saved first: adopt its clock (max rule) and retry once.
        try {
          const remote = await service.loadTeachingEnvelope(runId);
          if (remote) {
            adopt(remote.clock, remote.updatedAtClient);
            state.current.revision = remote.revision;
            state.current.history = remote.history.reduce((list, entry) => withHistoryEntry(list, entry.versionId, entry.firstOpenedAtClient), state.current.history);
            state.current.coverage = mergeCoverage(state.current.coverage, remote.coverage);
          }
          const saved = await service.saveTeachingEnvelope(build(), state.current.revision, tutorUid);
          state.current.revision = saved.revision;
          setSaveError("");
        } catch {
          dirty.current = true;
          if (!disposed.current) setSaveError("The private teaching record could not be saved yet; it is kept on this device.");
        }
      } else {
        dirty.current = true;
        if (!disposed.current) setSaveError("The private teaching record could not be saved yet; it is kept on this device.");
      }
    } finally {
      saving.current = false;
    }
  }, [adopt, currentClock, runId, sessionNumber, tutorUid]);

  const scheduleSave = useCallback(() => {
    if (!state.current.engaged || state.current.rehearsal) return;
    checkpointNow();
    dirty.current = true;
    if (saveTimer.current !== null) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      saveTimer.current = null;
      void flushCloud();
    }, CLOUD_SAVE_MS);
  }, [checkpointNow, flushCloud]);

  const engage = useCallback(() => {
    if (state.current.engaged) return;
    state.current.engaged = true;
    setEngaged(true);
  }, []);

  // Load: device checkpoint and cloud envelope, adopted by the max rule.
  useEffect(() => {
    disposed.current = false;
    let cancelled = false;
    const local = readCheckpoint(tutorUid, runId);
    void (async () => {
      let remote: TeachingSessionEnvelope | null = null;
      try {
        remote = await teachingMaterialService().loadTeachingEnvelope(runId);
      } catch {
        remote = null;
      }
      if (cancelled) return;
      if (local) adopt(local.clock, local.savedAt);
      if (remote) adopt(remote.clock, remote.updatedAtClient);
      const source = remote && (!local || Date.parse(remote.updatedAtClient) >= Date.parse(local.savedAt)) ? remote : local;
      if (remote) state.current.revision = remote.revision;
      if (source) {
        state.current.engaged = true;
        state.current.selectedVersionId = source.selectedVersionId;
        state.current.history = [...(remote?.history ?? []), ...(local?.history ?? [])]
          .reduce((list, entry) => withHistoryEntry(list, entry.versionId, entry.firstOpenedAtClient), [] as TeachingHistoryEntry[]);
        state.current.coverage = mergeCoverage(remote?.coverage ?? [], local?.coverage ?? []);
        state.current.finished = source.status === "finished";
        setCoverage(state.current.coverage);
        setEngaged(true);
        setSelectedVersionId(source.selectedVersionId);
        setFinished(source.status === "finished");
        setRestoredSurface(source.surface);
      }
      setReady(true);
    })();
    return () => {
      cancelled = true;
      disposed.current = true;
      if (saveTimer.current !== null) {
        window.clearTimeout(saveTimer.current);
        saveTimer.current = null;
      }
      // Exit/unmount: the host clock has paused; keep the last checkpoint.
      checkpointNow();
      void flushCloud();
    };
    // Load once per session workspace; the host clock and ids are stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reloading on callback identity would re-adopt recorded time.
  }, [runId, tutorUid]);

  // Every host clock transition (start, pause, resume, 30 s checkpoint,
  // pagehide) is mirrored synchronously to the device checkpoint.
  useEffect(() => subscribe(() => {
    if (state.current.rehearsal) return;
    const clock = currentClock();
    if (!state.current.engaged) {
      if (state.current.surface !== "pdf" || clock.status === "idle") return;
      engage();
    }
    if (state.current.finished && clock.status === "running") {
      state.current.finished = false;
      setFinished(false);
    }
    // Running 30-second checkpoints stay on the device; the cloud record is
    // written on state changes and at most every two minutes while teaching.
    const last = lastCloud.current;
    if (clock.status === "running" && last.status === "running" && Date.now() - last.at < CLOUD_CHECKPOINT_MS) {
      checkpointNow();
      return;
    }
    lastCloud.current = { status: clock.status, at: Date.now() };
    scheduleSave();
  }), [checkpointNow, currentClock, engage, scheduleSave, subscribe]);

  // Switching to the PDF surface while the session clock is under way.
  useEffect(() => {
    if (surface === "pdf" && ready && !rehearsal && currentClock().status !== "idle") engage();
  }, [currentClock, engage, ready, rehearsal, surface]);

  useEffect(() => {
    if (ready && engaged) scheduleSave();
  }, [engaged, guidedRunId, ready, scheduleSave, surface]);

  const selectVersion = useCallback((versionId: string | null) => {
    state.current.selectedVersionId = versionId;
    setSelectedVersionId(versionId);
    if (state.current.rehearsal) return;
    engage();
    scheduleSave();
  }, [engage, scheduleSave]);

  const recordOpened = useCallback((versionId: string) => {
    if (state.current.rehearsal) return;
    state.current.history = withHistoryEntry(state.current.history, versionId, new Date().toISOString());
    scheduleSave();
  }, [scheduleSave]);

  /** A page held on screen long enough while teaching (see DWELL_MS). */
  const markPageTaught = useCallback((versionId: string, page: number) => {
    const current = state.current;
    if (current.rehearsal || !current.engaged) return;
    const next = withTaughtPage(current.coverage, versionId, page);
    if (next.length === current.coverage.length && next.every((entry, index) => entry === current.coverage[index])) return;
    current.coverage = next;
    setCoverage(next);
    scheduleSave();
  }, [scheduleSave]);

  /** Batched teaching time; saved with the next clock or page save. */
  const addTeachingSeconds = useCallback((versionId: string, seconds: number) => {
    const current = state.current;
    if (current.rehearsal || !current.engaged) return;
    current.coverage = withTeachingSeconds(current.coverage, versionId, seconds);
    setCoverage(current.coverage);
    checkpointNow();
    dirty.current = true;
  }, [checkpointNow]);

  const finish = useCallback(() => {
    if (currentClock().status === "running") pauseClock();
    state.current.finished = true;
    setFinished(true);
    engage();
    scheduleSave();
  }, [currentClock, engage, pauseClock, scheduleSave]);

  return {
    runId, ready, selectedVersionId, selectVersion, recordOpened, finished, finish, restoredSurface, saveError,
    coverage, markPageTaught, addTeachingSeconds,
  };
}
