import {
  CloudAlert,
  LockKeyhole,
  RefreshCw,
  ShieldCheck,
  Upload,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  adaptTutorPlaybookPackage,
  isPreSessionRehearsal,
  LiveSessionConsole,
  sessionDeckKey,
  type ErrorCode,
  type LiveSessionCloseoutResult,
  type LiveSessionPlaybook,
  type LiveSessionRunSnapshot,
  type SyncPresentation,
} from "../features/liveSession";
import { getSessionTaskId, getWeekSessions, PLAN } from "../data/plan";
import {
  CloudClientError,
  deleteTutorLiveRun,
  diagnoseTutorCloudError,
  getCloudErrorMessage,
  getTutorLiveRun,
  importTutorPlaybookPackage,
  loadTutorPlaybookPackage,
  mapCloudError,
  saveTutorLiveRun,
  type CloudErrorCode,
} from "../lib/cloud";
import {
  applyLiveSessionCloseout,
  buildLiveSessionPrivateNote,
  removeLiveSessionCloseoutArtifacts,
} from "../lib/liveSessionCloseout";
import { effectiveSessionDate } from "../lib/schedule";
import {
  cacheTutorPlaybookOffline,
  cacheTutorRunOffline,
  getTutorOfflineStatus,
  journalTutorRunAction,
  loadTutorPlaybookOffline,
  loadTutorRunJournal,
  loadTutorRunOffline,
  removeTutorPlaybookOffline,
  removeTutorRunJournalAction,
  removeTutorRunOffline,
  type TutorRunJournalEntry,
} from "../lib/tutorOffline";
import type {
  TutorLiveRun,
  TutorLiveRunAction,
  TutorPlaybookPackage,
} from "../lib/tutorContent";
import type { PrivateTutorNote, TrackerState } from "../types";

const PLAYBOOK_ID = "hamad-cfa-mastery-session-01";
const RUN_ID_BASE = "hamad-cfa-mastery-session-01-2026-09-05";
const MAX_PRIVATE_PACKAGE_BYTES = 8 * 1024 * 1024;
const DESK_COMPLETE_NOTE = "[[session-desk-complete:v1]]";
const DESK_REOPEN_NOTE = "[[session-desk-reopen:v1]]";

function liveRunId(version: string, contentHash: string): string {
  return `${RUN_ID_BASE}-${version}-${contentHash.slice(0, 12)}`;
}

type UpdateTracker = (recipe: (current: TrackerState) => TrackerState) => void;

type UpdatePrivateTutorNotes = (
  recipe: (current: PrivateTutorNote[]) => PrivateTutorNote[]
) => Promise<void>;

type Notify = (message: string, tone?: "success" | "warning") => void;

interface TutorSessionWorkspaceProps {
  userUid: string;
  tracker: TrackerState;
  updateTracker: UpdateTracker;
  updatePrivateTutorNotes: UpdatePrivateTutorNotes;
  notify: Notify;
  onExit: () => void;
}

type PendingAction = Omit<
  TutorLiveRunAction,
  "id" | "atClient" | "elapsedSeconds"
>;

interface QueuedCloudMutation {
  scope: string;
  eventId: string;
  generation: number;
  cancelled: boolean;
  execute: () => Promise<TutorLiveRun>;
  resolve: (run: TutorLiveRun) => void;
  reject: (error: unknown) => void;
  attempts: number;
}

interface EnqueueActionOptions {
  eventId?: string;
  alreadyJournaled?: boolean;
}

const RETRYABLE_SYNC_ERRORS = new Set<CloudErrorCode>([
  "network-unavailable",
  "service-unavailable",
  "unknown",
]);

const MAX_CONFLICT_REBASE_ATTEMPTS = 4;
const MAX_UNKNOWN_RETRIES = 3;

class QueueScopeChangedError extends Error {
  constructor() {
    super(
      "The active Tutor Bible changed before this action was synchronized."
    );
    this.name = "QueueScopeChangedError";
  }
}

function syncRetryDelay(attempts: number): number {
  return Math.min(30_000, 1_000 * 2 ** Math.min(attempts, 5));
}

function snapshotElapsedSeconds(snapshot: LiveSessionRunSnapshot): number {
  const timer = snapshot.timer;
  if (!timer) return 0;
  let elapsedMs = timer.elapsedBeforeRunMs;
  if (timer.status === "running" && timer.runningSince) {
    elapsedMs += Math.max(0, Date.now() - Date.parse(timer.runningSince));
  }
  return Math.max(0, Math.floor(elapsedMs / 1_000));
}

function positionForSnapshot(
  snapshot: LiveSessionRunSnapshot,
  playbook: LiveSessionPlaybook
): { stageId: string; cardId: string | null } {
  const routeId = snapshot.routeId ?? playbook.routes[0]?.id ?? "";
  const stages = playbook.stagesByRoute[routeId] ?? [];
  const stage = stages[snapshot.stageIndex] ?? stages[0];
  const card =
    stage?.questions?.[snapshot.questionIndex] ?? stage?.questions?.[0];
  return {
    stageId: stage?.id ?? "session-launch",
    cardId: card?.id ?? null,
  };
}

function positionForDeskKey(
  key: string
): { stageId: string; cardId: string } | null {
  const separator = key.indexOf("::");
  if (separator <= 0 || separator >= key.length - 2) return null;
  return {
    stageId: key.slice(0, separator),
    cardId: key.slice(separator + 2),
  };
}

function targetLabel(
  playbook: LiveSessionPlaybook,
  routeId: string,
  stageId: string,
  cardId: string | null | undefined
): string {
  const stage = (playbook.stagesByRoute[routeId] ?? []).find(
    candidate => candidate.id === stageId
  );
  const question = stage?.questions?.find(candidate => candidate.id === cardId);
  return (
    question?.title || question?.label || stage?.title || cardId || stageId
  );
}

function tutorRunToSnapshot(
  run: TutorLiveRun,
  playbook: LiveSessionPlaybook
): LiveSessionRunSnapshot {
  const stages = playbook.stagesByRoute[run.routeId] ?? [];
  const stageIndex = Math.max(
    0,
    stages.findIndex(stage => stage.id === run.currentStageId)
  );
  const stage = stages[stageIndex];
  const questionIndex = Math.max(
    0,
    stage?.questions?.findIndex(
      question => question.id === run.currentCardId
    ) ?? 0
  );
  const route = playbook.routes.find(candidate => candidate.id === run.routeId);
  const evidence = run.events
    .filter(
      (
        event
      ): event is TutorLiveRunAction & {
        stageId: string;
        cardId: string;
        result: NonNullable<TutorLiveRunAction["result"]>;
        confidence: number;
        errorCodes: NonNullable<TutorLiveRunAction["errorCodes"]>;
      } =>
        event.type === "assessment" &&
        Boolean(
          event.stageId && event.cardId && event.result && event.confidence
        ) &&
        Array.isArray(event.errorCodes)
    )
    .map(event => ({
      id: event.id,
      stageId: event.stageId,
      targetId: event.cardId,
      targetLabel: targetLabel(
        playbook,
        run.routeId,
        event.stageId,
        event.cardId
      ),
      verdict: event.result,
      confidence: event.confidence,
      errorCodes: event.errorCodes as ErrorCode[],
      note: event.note ?? "",
      recordedAt: event.atClient,
    }));
  const completedDeskIds = new Set<string>();
  run.events.forEach(event => {
    if (!event.stageId || !event.cardId) return;
    const key = sessionDeckKey(event.stageId, event.cardId);
    if (event.type === "assessment" || event.note === DESK_COMPLETE_NOTE) {
      completedDeskIds.add(key);
    } else if (event.note === DESK_REOPEN_NOTE) {
      completedDeskIds.delete(key);
    }
  });
  const timerStatus =
    run.status === "completed"
      ? "complete"
      : run.status === "paused"
        ? "paused"
        : run.status === "running"
          ? "running"
          : "idle";
  const completedEvent = [...run.events]
    .reverse()
    .find(event => event.type === "complete" && event.closeout);
  const closeout = completedEvent?.closeout
    ? {
        sessionId: run.id,
        routeId: run.routeId,
        actualMinutes: Math.max(1, Math.round(run.elapsedSeconds / 60)),
        evidence,
        mastery: completedEvent.closeout.mastery,
        outcome: completedEvent.closeout.outcome,
        nextAction: completedEvent.closeout.nextAction,
        homework: completedEvent.closeout.homework,
        delayedRetest: completedEvent.closeout.delayedRetest,
        privateTutorNote: completedEvent.closeout.privateTutorNote,
        completedAt: completedEvent.atClient,
      }
    : null;

  return {
    phase:
      run.status === "completed"
        ? "complete"
        : run.status === "abandoned"
          ? "launch"
          : "running",
    routeId: run.routeId,
    stageIndex,
    questionIndex,
    evidence,
    completedDeskIds: [...completedDeskIds],
    closeout,
    timer: {
      status: timerStatus,
      durationMs: Math.max(1, route?.minutes ?? 150) * 60_000,
      runningSince: run.status === "running" ? run.updatedAtClient : null,
      elapsedBeforeRunMs: run.elapsedSeconds * 1_000,
      updatedAt: run.updatedAtClient,
    },
    updatedAt: run.updatedAtClient,
  };
}

function newerSnapshot(
  cloud: LiveSessionRunSnapshot | null,
  local: LiveSessionRunSnapshot | null
): LiveSessionRunSnapshot | null {
  if (!cloud) return local;
  if (!local || cloud.phase === "complete") return cloud;
  return Date.parse(local.updatedAt) > Date.parse(cloud.updatedAt)
    ? local
    : cloud;
}

function actionId(): string {
  const suffix =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().slice(0, 18)
      : `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  return `evt-${suffix}`;
}

function PrivateSetup({
  state,
  message,
  busy,
  onChoose,
  onRetry,
  onExit,
}: {
  state: "ready" | "error";
  message: string;
  busy: boolean;
  onChoose: () => void;
  onRetry: () => void;
  onExit: () => void;
}) {
  return (
    <main className="live-session ls-private-setup">
      <section
        className="ls-private-setup__card"
        aria-labelledby="private-setup-title"
      >
        <div className="ls-private-setup__mark">
          <LockKeyhole size={30} />
        </div>
        <p className="ls-eyebrow">One-time tutor setup</p>
        <h1 id="private-setup-title">
          Publish the private Session 01 Tutor Bible
        </h1>
        <p className="ls-private-setup__lead">
          Choose the generated private JSON package from this computer. It is
          validated, written directly to Mohamed&apos;s protected Firestore
          library, and never added to the public GitHub Pages build.
        </p>
        {state === "error" && (
          <div className="ls-private-setup__alert" role="alert">
            <CloudAlert size={18} />
            <span>{message}</span>
          </div>
        )}
        <div className="ls-private-setup__steps">
          <article>
            <span>01</span>
            <div>
              <strong>Select</strong>
              <p>Open the Session 01 private playbook JSON.</p>
            </div>
          </article>
          <article>
            <span>02</span>
            <div>
              <strong>Validate</strong>
              <p>
                The tracker verifies every route, stage, card, and content hash.
              </p>
            </div>
          </article>
          <article>
            <span>03</span>
            <div>
              <strong>Protect</strong>
              <p>
                Only the active tutor account can read the teaching scripts and
                answers.
              </p>
            </div>
          </article>
        </div>
        <button
          className="ls-button ls-button--primary ls-button--large"
          type="button"
          disabled={busy}
          onClick={onChoose}
        >
          {busy ? (
            <RefreshCw className="ls-spin" size={18} />
          ) : (
            <Upload size={18} />
          )}
          {busy ? "Publishing securely..." : "Choose private playbook JSON"}
        </button>
        <div className="ls-private-setup__assurance">
          <ShieldCheck size={17} />
          <span>Student access is denied at the database rules boundary.</span>
        </div>
        <div className="ls-private-setup__secondary">
          <button
            className="ls-button ls-button--quiet"
            type="button"
            onClick={onRetry}
          >
            <RefreshCw size={16} /> Retry private library
          </button>
          <button
            className="ls-button ls-button--quiet"
            type="button"
            onClick={onExit}
          >
            Return to tracker
          </button>
        </div>
      </section>
    </main>
  );
}

export default function TutorSessionWorkspace({
  userUid,
  tracker,
  updateTracker,
  updatePrivateTutorNotes,
  notify,
  onExit,
}: TutorSessionWorkspaceProps) {
  const [privatePackage, setPrivatePackage] =
    useState<TutorPlaybookPackage | null>(null);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">(
    "loading"
  );
  const [loadMessage, setLoadMessage] = useState("");
  const [publishing, setPublishing] = useState(false);
  const [offlineReady, setOfflineReady] = useState(false);
  const [syncState, setSyncState] = useState<SyncPresentation>("synced");
  const [syncMessage, setSyncMessage] = useState(
    "Private session state is current."
  );
  const [initialRun, setInitialRun] = useState<LiveSessionRunSnapshot | null>(
    null
  );
  const [workspaceEpoch, setWorkspaceEpoch] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);
  const loadSequenceRef = useRef(0);
  const cloudRunRef = useRef<TutorLiveRun | null>(null);
  const previousSnapshotRef = useRef<LiveSessionRunSnapshot | null>(null);
  const saveQueueRef = useRef<QueuedCloudMutation[]>([]);
  const syncGenerationRef = useRef(0);
  const activeScopeRef = useRef("");
  const drainingGenerationRef = useRef<number | null>(null);
  const retryTimerRef = useRef<number | null>(null);
  const terminalSyncErrorRef = useRef<unknown | null>(null);
  const quarantinedSyncIssueRef = useRef("");
  const startQueuedRef = useRef(false);
  const restoredJournalRef = useRef<TutorRunJournalEntry[]>([]);

  const resetSyncScope = useCallback((nextScope: string, force = false) => {
    if (!force && activeScopeRef.current === nextScope) return;
    activeScopeRef.current = nextScope;
    syncGenerationRef.current += 1;
    if (retryTimerRef.current !== null) {
      window.clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
    const cancelled = saveQueueRef.current.splice(0);
    cancelled.forEach(item => {
      item.cancelled = true;
      item.reject(new QueueScopeChangedError());
    });
    terminalSyncErrorRef.current = null;
    quarantinedSyncIssueRef.current = "";
    cloudRunRef.current = null;
    previousSnapshotRef.current = null;
    startQueuedRef.current = false;
    restoredJournalRef.current = [];
  }, []);

  const playbook = useMemo(
    () => (privatePackage ? adaptTutorPlaybookPackage(privatePackage) : null),
    [privatePackage]
  );
  const firstWeek = PLAN[0]!;
  const session = getWeekSessions(firstWeek)[0]!;
  const sessionDate = effectiveSessionDate(session, tracker.sessionOverrides);
  const runId = privatePackage
    ? liveRunId(
        privatePackage.manifest.version,
        privatePackage.manifest.contentHash
      )
    : RUN_ID_BASE;
  const sessionTaskId = getSessionTaskId(firstWeek, session);
  const descriptor = useMemo(
    () => ({
      id: runId,
      number: session.number,
      title: session.title,
      date: sessionDate,
      startTime: "09:00",
      candidateName: "Hamad Al Sagheer",
      topic: "Quantitative Methods",
    }),
    [runId, session.date, session.number, session.title, sessionDate]
  );

  const loadWorkspace = useCallback(async () => {
    const sequence = ++loadSequenceRef.current;
    setLoadState("loading");
    setLoadMessage("");
    let cloudPackage: TutorPlaybookPackage | null = null;
    let cloudProblem = "";
    try {
      cloudPackage = await loadTutorPlaybookPackage(PLAYBOOK_ID);
    } catch (error) {
      cloudProblem = getCloudErrorMessage(error);
    }

    let cachedPackage: TutorPlaybookPackage | null = null;
    let cachedRun: LiveSessionRunSnapshot | null = null;
    let cachedJournal: TutorRunJournalEntry[] = [];
    try {
      cachedPackage = await loadTutorPlaybookOffline(userUid, PLAYBOOK_ID);
    } catch {
      // A browser can disable IndexedDB. Cloud mode remains fully functional.
    }

    const selectedPackage = cloudPackage ?? cachedPackage;
    if (sequence !== loadSequenceRef.current) return;
    if (!selectedPackage) {
      resetSyncScope(`${userUid}:no-private-package`);
      setPrivatePackage(null);
      setOfflineReady(false);
      setLoadMessage(cloudProblem);
      setLoadState(cloudProblem ? "error" : "ready");
      setSyncState(cloudProblem ? "error" : "synced");
      return;
    }

    const selectedRunId = liveRunId(
      selectedPackage.manifest.version,
      selectedPackage.manifest.contentHash
    );
    resetSyncScope(`${userUid}:${selectedRunId}`);
    const [cachedRunResult, cachedJournalResult] = await Promise.allSettled([
      loadTutorRunOffline(userUid, selectedRunId),
      loadTutorRunJournal(userUid, selectedRunId),
    ]);
    if (cachedRunResult.status === "fulfilled") {
      cachedRun = cachedRunResult.value;
    }
    if (cachedJournalResult.status === "fulfilled") {
      cachedJournal = cachedJournalResult.value;
    }
    const adapted = adaptTutorPlaybookPackage(selectedPackage);
    let cloudRun: TutorLiveRun | null = null;
    if (cloudPackage) {
      try {
        cloudRun = await getTutorLiveRun(selectedRunId);
      } catch (error) {
        cloudProblem = getCloudErrorMessage(error);
      }
    }
    const cloudSnapshot = cloudRun
      ? tutorRunToSnapshot(cloudRun, adapted)
      : null;
    const restored = newerSnapshot(cloudSnapshot, cachedRun);
    if (sequence !== loadSequenceRef.current) return;

    cloudRunRef.current = cloudRun;
    restoredJournalRef.current = cachedJournal;
    startQueuedRef.current = Boolean(
      cloudRun || cachedJournal.some(entry => entry.action.type === "start")
    );
    previousSnapshotRef.current = cachedJournal.length ? restored : cloudSnapshot;
    setPrivatePackage(selectedPackage);
    setInitialRun(restored);
    setWorkspaceEpoch(value => value + 1);
    try {
      const status = await getTutorOfflineStatus(userUid, PLAYBOOK_ID);
      if (sequence === loadSequenceRef.current) {
        setOfflineReady(
          status.ready &&
            status.version === selectedPackage.manifest.version &&
            status.contentHash === selectedPackage.manifest.contentHash
        );
      }
    } catch {
      setOfflineReady(false);
    }
    setLoadState("ready");
    if (cloudPackage && !cloudProblem) {
      setSyncState("synced");
      setSyncMessage(
        "Private content and meaningful session actions are current."
      );
    } else {
      setSyncState("offline");
      setSyncMessage("Using the private device-local offline recovery copy.");
    }
  }, [resetSyncScope, userUid]);

  useEffect(() => {
    void loadWorkspace();
  }, [loadWorkspace]);

  const drainSaveQueue = useCallback(async () => {
    const generation = syncGenerationRef.current;
    if (drainingGenerationRef.current === generation) return;
    drainingGenerationRef.current = generation;
    try {
      while (
        generation === syncGenerationRef.current &&
        saveQueueRef.current.length > 0
      ) {
        if (terminalSyncErrorRef.current) return;
        const pending = saveQueueRef.current[0]!;
        if (
          pending.cancelled ||
          pending.generation !== generation ||
          pending.scope !== activeScopeRef.current
        ) {
          if (saveQueueRef.current[0] === pending) saveQueueRef.current.shift();
          if (!pending.cancelled) pending.reject(new QueueScopeChangedError());
          continue;
        }

        setSyncState("saving");
        setSyncMessage("Saving meaningful tutor actions in order...");
        try {
          const saved = await pending.execute();
          if (generation !== syncGenerationRef.current || pending.cancelled) {
            continue;
          }
          if (!saved.events.some(event => event.id === pending.eventId)) {
            throw new CloudClientError("tutor-live-run-conflict");
          }
          await removeTutorRunJournalAction(
            userUid,
            saved.id,
            pending.eventId
          );
          if (saveQueueRef.current[0] === pending) {
            saveQueueRef.current.shift();
          }
          pending.resolve(saved);
        } catch (error) {
          if (
            generation !== syncGenerationRef.current ||
            pending.cancelled ||
            saveQueueRef.current[0] !== pending
          ) {
            continue;
          }
          const cloudError = await diagnoseTutorCloudError(error);

          if (cloudError.code === "tutor-live-run-conflict") {
            terminalSyncErrorRef.current = cloudError;
            setSyncState("error");
            setSyncMessage(
              "A cloud change conflicts with a saved device action. The action remains on this device; retry to reconcile it."
            );
            return;
          }

          pending.attempts += 1;
          if (
            cloudError.code === "unknown" &&
            pending.attempts >= MAX_UNKNOWN_RETRIES
          ) {
            terminalSyncErrorRef.current = cloudError;
            setSyncState("error");
            setSyncMessage(
              "One saved device action could not be confirmed after three attempts. It remains queued; retry cloud sync."
            );
            return;
          }

          if (!RETRYABLE_SYNC_ERRORS.has(cloudError.code)) {
            terminalSyncErrorRef.current = cloudError;
            setSyncState("error");
            setSyncMessage(
              `${cloudError.message} Saved device actions remain queued. Correct the reported issue, then retry sync.`
            );
            return;
          }

          const delay = syncRetryDelay(pending.attempts - 1);
          setSyncState(navigator.onLine ? "error" : "offline");
          setSyncMessage(
            navigator.onLine
              ? `${cloudError.message} Retrying automatically in ${Math.ceil(delay / 1_000)} seconds.`
              : "Saved on this device. Cloud sync will resume automatically when the connection returns."
          );
          if (navigator.onLine) {
            if (retryTimerRef.current !== null) {
              window.clearTimeout(retryTimerRef.current);
            }
            retryTimerRef.current = window.setTimeout(() => {
              retryTimerRef.current = null;
              if (generation === syncGenerationRef.current) {
                void drainSaveQueue();
              }
            }, delay);
          }
          return;
        }
      }

      if (generation !== syncGenerationRef.current) return;
      if (quarantinedSyncIssueRef.current) {
        setSyncState("error");
        setSyncMessage(quarantinedSyncIssueRef.current);
      } else {
        setSyncState("synced");
        setSyncMessage(
          "Private session actions are current on every tutor device."
        );
      }
    } finally {
      if (drainingGenerationRef.current === generation) {
        drainingGenerationRef.current = null;
      }
    }
  }, [userUid]);

  useEffect(() => {
    const retryPendingActions = () => {
      if (retryTimerRef.current !== null) {
        window.clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
      if (saveQueueRef.current[0]) saveQueueRef.current[0].attempts = 0;
      void drainSaveQueue();
    };
    window.addEventListener("online", retryPendingActions);
    return () => {
      window.removeEventListener("online", retryPendingActions);
      if (retryTimerRef.current !== null) {
        window.clearTimeout(retryTimerRef.current);
      }
    };
  }, [drainSaveQueue]);

  const retrySyncNow = useCallback(() => {
    if (retryTimerRef.current !== null) {
      window.clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
    terminalSyncErrorRef.current = null;
    quarantinedSyncIssueRef.current = "";
    if (saveQueueRef.current[0]) {
      saveQueueRef.current[0].attempts = 0;
      void drainSaveQueue();
      return;
    }
    void loadWorkspace();
  }, [drainSaveQueue, loadWorkspace]);

  const enqueueAction = useCallback(
    async (
      payload: PendingAction,
      snapshot: LiveSessionRunSnapshot,
      options: EnqueueActionOptions = {}
    ): Promise<TutorLiveRun> => {
      if (!playbook || !privatePackage || !snapshot.routeId) {
        throw new Error("Choose a live-session route first.");
      }
      const eventId = options.eventId ?? actionId();
      const scope = `${userUid}:${runId}`;
      const generation = syncGenerationRef.current;
      const playbookId = privatePackage.manifest.id;
      const playbookVersion = privatePackage.manifest.version;
      const routeId = snapshot.routeId;
      const localElapsedSeconds = snapshotElapsedSeconds(snapshot);
      if (!options.alreadyJournaled) {
        try {
          await journalTutorRunAction(
            userUid,
            runId,
            eventId,
            payload,
            snapshot
          );
        } catch (error) {
          setSyncState("error");
          setSyncMessage(
            "This action could not be secured in device recovery storage. Free browser storage or close another tracker tab, then retry."
          );
          throw error;
        }
      }
      if (
        generation !== syncGenerationRef.current ||
        scope !== activeScopeRef.current
      ) {
        throw new QueueScopeChangedError();
      }
      const execute = async (): Promise<TutorLiveRun> => {
        let current =
          cloudRunRef.current?.id === runId ? cloudRunRef.current : null;
        let lastConflict: unknown = new CloudClientError(
          "tutor-live-run-conflict"
        );

        for (
          let attempt = 0;
          attempt < MAX_CONFLICT_REBASE_ATTEMPTS;
          attempt += 1
        ) {
          if (
            generation !== syncGenerationRef.current ||
            scope !== activeScopeRef.current
          ) {
            throw new QueueScopeChangedError();
          }

          if (current) {
            const sameIdentity =
              current.id === runId &&
              current.playbookId === playbookId &&
              current.playbookVersion === playbookVersion &&
              current.sessionNumber === session.number &&
              current.routeId === routeId;
            if (!sameIdentity) {
              throw new CloudClientError("tutor-live-run-conflict");
            }
            if (current.events.some(event => event.id === eventId)) {
              if (generation === syncGenerationRef.current) {
                cloudRunRef.current = current;
              }
              return current;
            }
            if (
              current.status === "completed" ||
              current.status === "abandoned"
            ) {
              throw new CloudClientError("tutor-live-run-conflict");
            }
          }

          const remoteTimestamp = current
            ? Date.parse(current.updatedAtClient)
            : 0;
          const atClient = new Date(
            Math.max(
              Date.now(),
              Number.isFinite(remoteTimestamp) ? remoteTimestamp + 1 : 0
            )
          ).toISOString();
          const elapsedSeconds =
            payload.type === "start" && !current
              ? 0
              : Math.max(current?.elapsedSeconds ?? 0, localElapsedSeconds);
          try {
            const saved = await saveTutorLiveRun({
              runId,
              playbookId,
              playbookVersion,
              sessionNumber: session.number,
              routeId,
              expectedRevision: current?.revision ?? 0,
              action: {
                ...payload,
                id: eventId,
                atClient,
                elapsedSeconds,
              },
            });
            if (generation === syncGenerationRef.current) {
              cloudRunRef.current = saved;
            }
            return saved;
          } catch (error) {
            const cloudError = mapCloudError(error);
            if (cloudError.code !== "tutor-live-run-conflict") {
              throw cloudError;
            }
            lastConflict = cloudError;
            const latest = await getTutorLiveRun(runId);
            if (latest?.events.some(event => event.id === eventId)) {
              if (generation === syncGenerationRef.current) {
                cloudRunRef.current = latest;
              }
              return latest;
            }
            current = latest;
          }
        }
        throw lastConflict;
      };
      const queued = new Promise<TutorLiveRun>((resolve, reject) => {
        saveQueueRef.current.push({
          scope,
          eventId,
          generation,
          cancelled: false,
          execute,
          resolve,
          reject,
          attempts: 0,
        });
      });
      void drainSaveQueue();
      return await queued;
    },
    [
      drainSaveQueue,
      playbook,
      privatePackage,
      runId,
      session.number,
      userUid,
    ]
  );

  useEffect(() => {
    if (!playbook || !privatePackage) return;
    const restored = restoredJournalRef.current.splice(0);
    restored.forEach(entry => {
      void enqueueAction(entry.action, entry.snapshot, {
        eventId: entry.eventId,
        alreadyJournaled: true,
      }).catch(() => undefined);
    });
  }, [enqueueAction, playbook, privatePackage, workspaceEpoch]);

  const handleRunChange = useCallback(
    (snapshot: LiveSessionRunSnapshot) => {
      void cacheTutorRunOffline(userUid, runId, snapshot).catch(
        () => undefined
      );
      const previous = previousSnapshotRef.current;
      previousSnapshotRef.current = snapshot;
      if (!playbook || !snapshot.routeId) return;
      const currentPosition = positionForSnapshot(snapshot, playbook);
      const previousPosition = previous
        ? positionForSnapshot(previous, playbook)
        : null;

      if (
        snapshot.phase !== "launch" &&
        !cloudRunRef.current &&
        !startQueuedRef.current
      ) {
        startQueuedRef.current = true;
        void enqueueAction(
          {
            type: "start",
            stageId: currentPosition.stageId,
            cardId: currentPosition.cardId,
          },
          snapshot
        ).catch(() => {
          startQueuedRef.current = false;
        });
      }

      const priorTimerStatus = previous?.timer?.status;
      const nextTimerStatus = snapshot.timer?.status;
      if (priorTimerStatus === "running" && nextTimerStatus === "paused") {
        void enqueueAction({ type: "pause" }, snapshot).catch(() => undefined);
      } else if (
        priorTimerStatus === "paused" &&
        nextTimerStatus === "running"
      ) {
        void enqueueAction({ type: "resume" }, snapshot).catch(() => undefined);
      }

      const previousEvidenceIds = new Set(
        previous?.evidence.map(entry => entry.id) ?? []
      );
      const newEvidenceEntries = snapshot.evidence.filter(
        entry => !previousEvidenceIds.has(entry.id)
      );
      const newlyAssessedDeskKeys = new Set(
        newEvidenceEntries.map(entry =>
          sessionDeckKey(entry.stageId, entry.targetId)
        )
      );
      newEvidenceEntries.forEach(entry => {
        void enqueueAction(
          {
            type: "assessment",
            stageId: entry.stageId,
            cardId: entry.targetId,
            result: entry.verdict,
            confidence: entry.confidence,
            errorCodes: entry.errorCodes,
            ...(entry.note ? { note: entry.note } : {}),
          },
          snapshot
        ).catch(() => undefined);
      });

      const previousCompleted = new Set(previous?.completedDeskIds ?? []);
      const nextCompleted = new Set(snapshot.completedDeskIds ?? []);
      [...nextCompleted]
        .filter(
          key => !previousCompleted.has(key) && !newlyAssessedDeskKeys.has(key)
        )
        .forEach(key => {
          const position = positionForDeskKey(key);
          if (!position) return;
          void enqueueAction(
            {
              type: "note",
              stageId: position.stageId,
              cardId: position.cardId,
              note: DESK_COMPLETE_NOTE,
            },
            snapshot
          ).catch(() => undefined);
        });
      [...previousCompleted]
        .filter(key => !nextCompleted.has(key))
        .forEach(key => {
          const position = positionForDeskKey(key);
          if (!position) return;
          void enqueueAction(
            {
              type: "note",
              stageId: position.stageId,
              cardId: position.cardId,
              note: DESK_REOPEN_NOTE,
            },
            snapshot
          ).catch(() => undefined);
        });

      if (
        previousPosition &&
        (previousPosition.stageId !== currentPosition.stageId ||
          previousPosition.cardId !== currentPosition.cardId)
      ) {
        void enqueueAction(
          {
            type: "navigate",
            stageId: currentPosition.stageId,
            cardId: currentPosition.cardId,
          },
          snapshot
        ).catch(() => undefined);
      }

      if (
        snapshot.phase === "complete" &&
        snapshot.closeout &&
        cloudRunRef.current?.status !== "completed" &&
        (previous?.phase !== "complete" ||
          previous.closeout?.completedAt !== snapshot.closeout.completedAt)
      ) {
        const closeout = snapshot.closeout;
        void enqueueAction(
          {
            type: "complete",
            closeout: {
              mastery: closeout.mastery,
              outcome: closeout.outcome,
              nextAction: closeout.nextAction,
              homework: closeout.homework,
              delayedRetest: closeout.delayedRetest,
              privateTutorNote: closeout.privateTutorNote,
            },
          },
          snapshot
        ).catch(error => {
          notify(
            `The closeout is safe on this device; cloud sync needs attention: ${getCloudErrorMessage(error)}`,
            "warning"
          );
        });
      }
    },
    [enqueueAction, notify, playbook, runId, userUid]
  );

  const prepareOffline = useCallback(async () => {
    if (!privatePackage) return;
    const status = await cacheTutorPlaybookOffline(userUid, privatePackage);
    setOfflineReady(status.ready);
    notify("Private Session 01 content is ready offline on this device.");
  }, [notify, privatePackage, userUid]);

  const removeOffline = useCallback(async () => {
    await removeTutorPlaybookOffline(userUid, PLAYBOOK_ID);
    setOfflineReady(false);
    notify("The private offline playbook was removed from this device.");
  }, [notify, userUid]);

  const completeSession = useCallback(
    (result: LiveSessionCloseoutResult) => {
      updateTracker(current =>
        applyLiveSessionCloseout({
          tracker: current,
          result,
          sessionNumber: session.number,
          week: firstWeek.week,
          date: sessionDate,
          title: session.title,
          taskId: sessionTaskId,
        })
      );
      const privateNote = buildLiveSessionPrivateNote(result, sessionDate);
      if (privateNote) {
        void updatePrivateTutorNotes(notes => [
          privateNote,
          ...notes.filter(note => note.id !== privateNote.id),
        ]).catch(error => {
          notify(
            `Shared records are saved; retry the private note later: ${getCloudErrorMessage(error)}`,
            "warning"
          );
        });
      }
      notify(
        "Session 01 is saved on this device. Cloud closeout is syncing in the background."
      );
    },
    [
      firstWeek.week,
      notify,
      session.number,
      session.title,
      sessionDate,
      sessionTaskId,
      updatePrivateTutorNotes,
      updateTracker,
    ]
  );

  const discardPreSessionRehearsal = useCallback(
    async (result: LiveSessionCloseoutResult) => {
      if (
        result.sessionId !== runId ||
        !isPreSessionRehearsal(result.completedAt, sessionDate, "09:00")
      ) {
        throw new Error(
          "Only a run completed before the scheduled session can be cleared here."
        );
      }

      setSyncState("saving");
      setSyncMessage("Clearing the rehearsal from cloud and device recovery...");
      // A restart deliberately reuses the same deterministic run ID. Force a
      // new queue generation so an old retry cannot race the delete.
      resetSyncScope(`${userUid}:${runId}`, true);
      try {
        await deleteTutorLiveRun(runId);
        await removeTutorRunOffline(userUid, runId);
      } catch (error) {
        const cloudError = mapCloudError(error);
        setSyncState(navigator.onLine ? "error" : "offline");
        setSyncMessage(
          `${cloudError.message} The completed rehearsal remains available; retry when ready.`
        );
        throw cloudError;
      }

      updateTracker(current =>
        removeLiveSessionCloseoutArtifacts({
          tracker: current,
          result,
          taskId: sessionTaskId,
        })
      );

      const privateNote = buildLiveSessionPrivateNote(result, sessionDate);
      if (privateNote) {
        try {
          await updatePrivateTutorNotes(notes =>
            notes.filter(note => note.id !== privateNote.id)
          );
        } catch (error) {
          notify(
            `The rehearsal reopened, but its private note needs manual removal: ${getCloudErrorMessage(error)}`,
            "warning"
          );
        }
      }

      setInitialRun(null);
      setWorkspaceEpoch(value => value + 1);
      setSyncState("synced");
      setSyncMessage("Fresh Session 01 launch is ready on this device.");
      notify(
        "Pre-session rehearsal cleared. Session 01 is ready to start fresh."
      );
    },
    [
      notify,
      resetSyncScope,
      runId,
      sessionDate,
      sessionTaskId,
      updatePrivateTutorNotes,
      updateTracker,
      userUid,
    ]
  );

  const importPrivatePackage = useCallback(
    async (file: File | undefined) => {
      if (!file) return;
      setPublishing(true);
      try {
        if (file.size > MAX_PRIVATE_PACKAGE_BYTES) {
          throw new Error(
            "The private package is larger than the 8 MB safety limit."
          );
        }
        const value: unknown = JSON.parse(await file.text());
        const published = await importTutorPlaybookPackage(value);
        if (published.manifest.id !== PLAYBOOK_ID) {
          throw new Error(
            "Choose the Session 01 Hamad CFA Mastery playbook package."
          );
        }
        await cacheTutorPlaybookOffline(userUid, published);
        await loadWorkspace();
        notify(
          `Private Tutor Bible ${published.manifest.version} published with protected offline recovery.`
        );
      } catch (error) {
        setLoadState("error");
        setLoadMessage(getCloudErrorMessage(error));
        notify(getCloudErrorMessage(error), "warning");
      } finally {
        setPublishing(false);
        if (fileRef.current) fileRef.current.value = "";
      }
    },
    [loadWorkspace, notify, userUid]
  );

  return (
    <>
      {loadState === "loading" ? (
        <LiveSessionConsole
          session={descriptor}
          playbook={null}
          loadState="loading"
          onComplete={completeSession}
          onExit={onExit}
        />
      ) : !privatePackage || !playbook ? (
        <PrivateSetup
          state={loadState === "error" ? "error" : "ready"}
          message={loadMessage}
          busy={publishing}
          onChoose={() => fileRef.current?.click()}
          onRetry={retrySyncNow}
          onExit={onExit}
        />
      ) : (
        <LiveSessionConsole
          key={`${runId}:${workspaceEpoch}`}
          session={descriptor}
          playbook={playbook}
          loadState="ready"
          initialRun={initialRun}
          syncState={syncState}
          syncMessage={syncMessage}
          offlineReady={offlineReady}
          onRetry={retrySyncNow}
          onPrepareOffline={prepareOffline}
          onRemoveOffline={removeOffline}
          onReplacePlaybook={() => fileRef.current?.click()}
          replacingPlaybook={publishing}
          onRunChange={handleRunChange}
          onComplete={completeSession}
          onDiscardRehearsal={discardPreSessionRehearsal}
          onExit={onExit}
        />
      )}
      <input
        className="visually-hidden"
        ref={fileRef}
        type="file"
        accept="application/json,.json"
        onChange={event => void importPrivatePackage(event.target.files?.[0])}
      />
    </>
  );
}
