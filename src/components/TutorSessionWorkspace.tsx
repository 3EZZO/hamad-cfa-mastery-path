import {
  CloudAlert,
  LockKeyhole,
  RefreshCw,
  ShieldCheck,
  Upload,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  adaptTutorPlaybookPackage,
  LiveSessionConsole,
  type ErrorCode,
  type LiveSessionCloseoutResult,
  type LiveSessionPlaybook,
  type LiveSessionRunSnapshot,
  type SyncPresentation,
} from "../features/liveSession";
import { getSessionTaskId, getWeekSessions, PLAN } from "../data/plan";
import {
  getCloudErrorMessage,
  getTutorLiveRun,
  importTutorPlaybookPackage,
  loadTutorPlaybookPackage,
  saveTutorLiveRun,
} from "../lib/cloud";
import {
  applyLiveSessionCloseout,
  buildLiveSessionPrivateNote,
} from "../lib/liveSessionCloseout";
import { effectiveSessionDate } from "../lib/schedule";
import {
  cacheTutorPlaybookOffline,
  cacheTutorRunOffline,
  getTutorOfflineStatus,
  loadTutorPlaybookOffline,
  loadTutorRunOffline,
  removeTutorPlaybookOffline,
} from "../lib/tutorOffline";
import type {
  TutorLiveRun,
  TutorLiveRunAction,
  TutorPlaybookPackage,
} from "../lib/tutorContent";
import type { PrivateTutorNote, TrackerState } from "../types";

const PLAYBOOK_ID = "hamad-cfa-mastery-session-01";
const RUN_ID = "hamad-cfa-mastery-session-01-2026-09-05";
const MAX_PRIVATE_PACKAGE_BYTES = 8 * 1024 * 1024;

type UpdateTracker = (
  recipe: (current: TrackerState) => TrackerState,
) => void;

type UpdatePrivateTutorNotes = (
  recipe: (current: PrivateTutorNote[]) => PrivateTutorNote[],
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
  playbook: LiveSessionPlaybook,
): { stageId: string; cardId: string | null } {
  const routeId = snapshot.routeId ?? playbook.routes[0]?.id ?? "";
  const stages = playbook.stagesByRoute[routeId] ?? [];
  const stage = stages[snapshot.stageIndex] ?? stages[0];
  const card = stage?.questions?.[snapshot.questionIndex] ?? stage?.questions?.[0];
  return {
    stageId: stage?.id ?? "session-launch",
    cardId: card?.id ?? null,
  };
}

function targetLabel(
  playbook: LiveSessionPlaybook,
  routeId: string,
  stageId: string,
  cardId: string | null | undefined,
): string {
  const stage = (playbook.stagesByRoute[routeId] ?? []).find(
    (candidate) => candidate.id === stageId,
  );
  const question = stage?.questions?.find((candidate) => candidate.id === cardId);
  return question?.title || question?.label || stage?.title || cardId || stageId;
}

function tutorRunToSnapshot(
  run: TutorLiveRun,
  playbook: LiveSessionPlaybook,
): LiveSessionRunSnapshot {
  const stages = playbook.stagesByRoute[run.routeId] ?? [];
  const stageIndex = Math.max(
    0,
    stages.findIndex((stage) => stage.id === run.currentStageId),
  );
  const stage = stages[stageIndex];
  const questionIndex = Math.max(
    0,
    stage?.questions?.findIndex((question) => question.id === run.currentCardId) ??
      0,
  );
  const route = playbook.routes.find((candidate) => candidate.id === run.routeId);
  const evidence = run.events
    .filter(
      (event): event is TutorLiveRunAction & {
        stageId: string;
        cardId: string;
        result: NonNullable<TutorLiveRunAction["result"]>;
        confidence: number;
        errorCodes: NonNullable<TutorLiveRunAction["errorCodes"]>;
      } =>
        event.type === "assessment" &&
        Boolean(event.stageId && event.cardId && event.result && event.confidence) &&
        Array.isArray(event.errorCodes),
    )
    .map((event) => ({
      id: event.id,
      stageId: event.stageId,
      targetId: event.cardId,
      targetLabel: targetLabel(
        playbook,
        run.routeId,
        event.stageId,
        event.cardId,
      ),
      verdict: event.result,
      confidence: event.confidence,
      errorCodes: event.errorCodes as ErrorCode[],
      note: event.note ?? "",
      recordedAt: event.atClient,
    }));
  const timerStatus =
    run.status === "completed"
      ? "complete"
      : run.status === "paused"
        ? "paused"
        : run.status === "running"
          ? "running"
          : "idle";

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
  local: LiveSessionRunSnapshot | null,
): LiveSessionRunSnapshot | null {
  if (!cloud) return local;
  if (!local || cloud.phase === "complete") return cloud;
  return Date.parse(local.updatedAt) > Date.parse(cloud.updatedAt) ? local : cloud;
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
      <section className="ls-private-setup__card" aria-labelledby="private-setup-title">
        <div className="ls-private-setup__mark"><LockKeyhole size={30} /></div>
        <p className="ls-eyebrow">One-time tutor setup</p>
        <h1 id="private-setup-title">Publish the private Session 01 Tutor Bible</h1>
        <p className="ls-private-setup__lead">
          Choose the generated private JSON package from this computer. It is
          validated, written directly to Mohamed&apos;s protected Firestore library,
          and never added to the public GitHub Pages build.
        </p>
        {state === "error" && (
          <div className="ls-private-setup__alert" role="alert">
            <CloudAlert size={18} />
            <span>{message}</span>
          </div>
        )}
        <div className="ls-private-setup__steps">
          <article><span>01</span><div><strong>Select</strong><p>Open the Session 01 private playbook JSON.</p></div></article>
          <article><span>02</span><div><strong>Validate</strong><p>The tracker verifies every route, stage, card, and content hash.</p></div></article>
          <article><span>03</span><div><strong>Protect</strong><p>Only the active tutor account can read the teaching scripts and answers.</p></div></article>
        </div>
        <button
          className="ls-button ls-button--primary ls-button--large"
          type="button"
          disabled={busy}
          onClick={onChoose}
        >
          {busy ? <RefreshCw className="ls-spin" size={18} /> : <Upload size={18} />}
          {busy ? "Publishing securely..." : "Choose private playbook JSON"}
        </button>
        <div className="ls-private-setup__assurance">
          <ShieldCheck size={17} />
          <span>Student access is denied at the database rules boundary.</span>
        </div>
        <div className="ls-private-setup__secondary">
          <button className="ls-button ls-button--quiet" type="button" onClick={onRetry}>
            <RefreshCw size={16} /> Retry private library
          </button>
          <button className="ls-button ls-button--quiet" type="button" onClick={onExit}>
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
    "loading",
  );
  const [loadMessage, setLoadMessage] = useState("");
  const [publishing, setPublishing] = useState(false);
  const [offlineReady, setOfflineReady] = useState(false);
  const [syncState, setSyncState] = useState<SyncPresentation>("synced");
  const [syncMessage, setSyncMessage] = useState("Private session state is current.");
  const [initialRun, setInitialRun] =
    useState<LiveSessionRunSnapshot | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const loadSequenceRef = useRef(0);
  const cloudRunRef = useRef<TutorLiveRun | null>(null);
  const previousSnapshotRef = useRef<LiveSessionRunSnapshot | null>(null);
  const saveQueueRef = useRef<Promise<unknown>>(Promise.resolve());
  const startQueuedRef = useRef(false);

  const playbook = useMemo(
    () => (privatePackage ? adaptTutorPlaybookPackage(privatePackage) : null),
    [privatePackage],
  );
  const firstWeek = PLAN[0]!;
  const session = getWeekSessions(firstWeek)[0]!;
  const sessionDate = effectiveSessionDate(session, tracker.sessionOverrides);
  const sessionTaskId = getSessionTaskId(firstWeek, session);
  const descriptor = useMemo(
    () => ({
      id: RUN_ID,
      number: session.number,
      title: session.title,
      date: sessionDate,
      startTime: "09:00",
      candidateName: "Hamad Al Sagheer",
      topic: "Quantitative Methods",
    }),
    [session.date, session.number, session.title, sessionDate],
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
    try {
      [cachedPackage, cachedRun] = await Promise.all([
        loadTutorPlaybookOffline(userUid, PLAYBOOK_ID),
        loadTutorRunOffline(userUid, RUN_ID),
      ]);
    } catch {
      // A browser can disable IndexedDB. Cloud mode remains fully functional.
    }

    const selectedPackage = cloudPackage ?? cachedPackage;
    if (sequence !== loadSequenceRef.current) return;
    if (!selectedPackage) {
      setPrivatePackage(null);
      setOfflineReady(false);
      setLoadMessage(cloudProblem);
      setLoadState(cloudProblem ? "error" : "ready");
      setSyncState(cloudProblem ? "error" : "synced");
      return;
    }

    const adapted = adaptTutorPlaybookPackage(selectedPackage);
    let cloudRun: TutorLiveRun | null = null;
    if (cloudPackage) {
      try {
        cloudRun = await getTutorLiveRun(RUN_ID);
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
    startQueuedRef.current = Boolean(cloudRun);
    previousSnapshotRef.current = cloudSnapshot;
    setPrivatePackage(selectedPackage);
    setInitialRun(restored);
    try {
      const status = await getTutorOfflineStatus(userUid, PLAYBOOK_ID);
      if (sequence === loadSequenceRef.current) setOfflineReady(status.ready);
    } catch {
      setOfflineReady(false);
    }
    setLoadState("ready");
    if (cloudPackage && !cloudProblem) {
      setSyncState("synced");
      setSyncMessage("Private content and meaningful session actions are current.");
    } else {
      setSyncState("offline");
      setSyncMessage("Using the private device-local offline recovery copy.");
    }
  }, [userUid]);

  useEffect(() => {
    void loadWorkspace();
  }, [loadWorkspace]);

  const enqueueAction = useCallback(
    (
      payload: PendingAction,
      snapshot: LiveSessionRunSnapshot,
    ): Promise<TutorLiveRun> => {
      if (!playbook || !snapshot.routeId) {
        return Promise.reject(new Error("Choose a live-session route first."));
      }
      const execute = async (): Promise<TutorLiveRun> => {
        setSyncState("saving");
        setSyncMessage("Saving a meaningful tutor action...");
        const current = cloudRunRef.current;
        const elapsedSeconds =
          payload.type === "start"
            ? 0
            : Math.max(current?.elapsedSeconds ?? 0, snapshotElapsedSeconds(snapshot));
        const eventId = actionId();
        const buildRequest = (
          revision: number,
          atClient = new Date().toISOString(),
        ): Parameters<typeof saveTutorLiveRun>[0] => ({
          runId: RUN_ID,
          playbookId: privatePackage!.manifest.id,
          playbookVersion: privatePackage!.manifest.version,
          sessionNumber: session.number,
          routeId: snapshot.routeId!,
          expectedRevision: revision,
          action: {
            ...payload,
            id: eventId,
            atClient,
            elapsedSeconds,
          },
        });
        try {
          const saved = await saveTutorLiveRun(buildRequest(current?.revision ?? 0));
          cloudRunRef.current = saved;
          setSyncState("synced");
          setSyncMessage("Private session actions are current on every tutor device.");
          return saved;
        } catch (firstError) {
          const latest = await getTutorLiveRun(RUN_ID).catch(() => null);
          if (latest?.events.some((event) => event.id === eventId)) {
            cloudRunRef.current = latest;
            setSyncState("synced");
            setSyncMessage("The saved action was verified after reconnecting.");
            return latest;
          }
          if (latest && latest.status !== "completed" && latest.status !== "abandoned") {
            cloudRunRef.current = latest;
            const retried = await saveTutorLiveRun(
              buildRequest(latest.revision, new Date().toISOString()),
            );
            cloudRunRef.current = retried;
            setSyncState("synced");
            setSyncMessage("A cross-device change was reconciled safely.");
            return retried;
          }
          throw firstError;
        }
      };
      const queued = saveQueueRef.current.catch(() => undefined).then(execute);
      saveQueueRef.current = queued.catch((error) => {
        setSyncState(navigator.onLine ? "error" : "offline");
        setSyncMessage(getCloudErrorMessage(error));
      });
      return queued;
    },
    [playbook, privatePackage, session.number],
  );

  const handleRunChange = useCallback(
    (snapshot: LiveSessionRunSnapshot) => {
      void cacheTutorRunOffline(userUid, RUN_ID, snapshot).catch(() => undefined);
      const previous = previousSnapshotRef.current;
      previousSnapshotRef.current = snapshot;
      if (!playbook || !snapshot.routeId) return;
      const currentPosition = positionForSnapshot(snapshot, playbook);
      const previousPosition = previous
        ? positionForSnapshot(previous, playbook)
        : null;

      if (
        snapshot.phase === "running" &&
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
          snapshot,
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
        previous?.evidence.map((entry) => entry.id) ?? [],
      );
      snapshot.evidence
        .filter((entry) => !previousEvidenceIds.has(entry.id))
        .forEach((entry) => {
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
            snapshot,
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
          snapshot,
        ).catch(() => undefined);
      }
    },
    [enqueueAction, playbook, userUid],
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
    async (result: LiveSessionCloseoutResult) => {
      const snapshot = previousSnapshotRef.current;
      if (snapshot) {
        try {
          await enqueueAction(
            {
              type: "complete",
              closeout: {
                mastery: result.mastery,
                outcome: result.outcome,
                nextAction: result.nextAction,
                homework: result.homework,
                delayedRetest: result.delayedRetest,
                privateTutorNote: result.privateTutorNote,
              },
            },
            snapshot,
          );
        } catch (error) {
          notify(
            `Closeout is safe locally, but private run sync needs attention: ${getCloudErrorMessage(error)}`,
            "warning",
          );
        }
      }

      updateTracker((current) =>
        applyLiveSessionCloseout({
          tracker: current,
          result,
          sessionNumber: session.number,
          week: firstWeek.week,
          date: sessionDate,
          title: session.title,
          taskId: sessionTaskId,
        }),
      );
      const privateNote = buildLiveSessionPrivateNote(result, sessionDate);
      if (privateNote) {
        try {
          await updatePrivateTutorNotes((notes) => [
            privateNote,
            ...notes.filter((note) => note.id !== privateNote.id),
          ]);
        } catch (error) {
          notify(
            `Shared records are saved; retry the private note later: ${getCloudErrorMessage(error)}`,
            "warning",
          );
        }
      }
      const completedSnapshot = snapshot
        ? {
            ...snapshot,
            phase: "complete" as const,
            timer: snapshot.timer
              ? { ...snapshot.timer, status: "complete" as const }
              : null,
            updatedAt: result.completedAt,
          }
        : null;
      if (completedSnapshot) {
        previousSnapshotRef.current = completedSnapshot;
        await cacheTutorRunOffline(userUid, RUN_ID, completedSnapshot).catch(
          () => undefined,
        );
      }
      notify("Session 01 closed out: tracker, mastery, practice, and repairs updated.");
    },
    [
      enqueueAction,
      firstWeek.week,
      notify,
      session.number,
      session.title,
      sessionDate,
      sessionTaskId,
      updatePrivateTutorNotes,
      updateTracker,
      userUid,
    ],
  );

  const importPrivatePackage = useCallback(
    async (file: File | undefined) => {
      if (!file) return;
      setPublishing(true);
      try {
        if (file.size > MAX_PRIVATE_PACKAGE_BYTES) {
          throw new Error("The private package is larger than the 8 MB safety limit.");
        }
        const value: unknown = JSON.parse(await file.text());
        const published = await importTutorPlaybookPackage(value);
        if (published.manifest.id !== PLAYBOOK_ID) {
          throw new Error("Choose the Session 01 Hamad CFA Mastery playbook package.");
        }
        await cacheTutorPlaybookOffline(userUid, published);
        setPrivatePackage(published);
        setOfflineReady(true);
        notify("Private Tutor Bible published and prepared offline.");
        await loadWorkspace();
      } catch (error) {
        setLoadState("error");
        setLoadMessage(getCloudErrorMessage(error));
        notify(getCloudErrorMessage(error), "warning");
      } finally {
        setPublishing(false);
        if (fileRef.current) fileRef.current.value = "";
      }
    },
    [loadWorkspace, notify, userUid],
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
          onRetry={() => void loadWorkspace()}
          onExit={onExit}
        />
      ) : (
        <LiveSessionConsole
          session={descriptor}
          playbook={playbook}
          loadState="ready"
          initialRun={initialRun}
          syncState={syncState}
          syncMessage={syncMessage}
          offlineReady={offlineReady}
          onRetry={() => void loadWorkspace()}
          onPrepareOffline={prepareOffline}
          onRemoveOffline={removeOffline}
          onRunChange={handleRunChange}
          onComplete={completeSession}
          onExit={onExit}
        />
      )}
      <input
        className="visually-hidden"
        ref={fileRef}
        type="file"
        accept="application/json,.json"
        onChange={(event) => void importPrivatePackage(event.target.files?.[0])}
      />
    </>
  );
}
