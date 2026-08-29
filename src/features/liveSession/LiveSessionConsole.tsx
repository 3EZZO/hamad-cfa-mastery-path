import {
  CheckCircle2,
  ChevronRight,
  CloudAlert,
  LogOut,
  RefreshCw,
  Settings2,
  ShieldCheck,
  Upload,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { LiveSessionRunner } from "./LiveSessionRunner";
import { sessionDeckKey } from "./sessionDeckModel";
import { SessionCloseout } from "./SessionCloseout";
import { SessionLaunch } from "./SessionLaunch";
import type {
  LiveSessionCloseoutResult,
  LiveSessionConsoleProps,
  LiveSessionEvidence,
  LiveSessionPhase,
  LiveSessionPlaybook,
  LiveSessionRoute,
  SessionTimerSnapshot,
} from "./types";
import { useSessionTimer } from "./useSessionTimer";

function preferredRouteId(
  playbook: LiveSessionPlaybook,
  initialRouteId: string | null | undefined
): string {
  if (
    initialRouteId &&
    playbook.routes.some(route => route.id === initialRouteId)
  ) {
    return initialRouteId;
  }
  return (
    playbook.routes.find(route => route.recommended)?.id ??
    playbook.routes[0]?.id ??
    ""
  );
}

function LoadingState() {
  return (
    <section
      className="ls-state ls-state--loading"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="ls-loading-mark" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
      <p className="ls-eyebrow">Opening the private tutor desk</p>
      <h2>Preparing Session Mode</h2>
      <p>Validating the playbook and restoring your last safe position.</p>
      <div className="ls-skeleton-stack" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
    </section>
  );
}

function LoadError({
  message,
  onRetry,
  onExit,
}: {
  message?: string;
  onRetry?: () => void;
  onExit?: () => void;
}) {
  return (
    <section className="ls-state ls-state--error" role="alert">
      <span className="ls-state__icon">
        <CloudAlert size={29} />
      </span>
      <p className="ls-eyebrow">Private content unavailable</p>
      <h2>The tutor desk did not open</h2>
      <p>
        {message || "Check your connection and tutor access, then try again."}
      </p>
      <div className="ls-state__actions">
        {onRetry && (
          <button
            className="ls-button ls-button--primary"
            type="button"
            onClick={onRetry}
          >
            <RefreshCw size={17} /> Try again
          </button>
        )}
        {onExit && (
          <button
            className="ls-button ls-button--quiet"
            type="button"
            onClick={onExit}
          >
            Return to tracker
          </button>
        )}
      </div>
    </section>
  );
}

function WorkspaceFrame({
  playbook,
  replacingPlaybook,
  onReplacePlaybook,
  onExit,
  children,
}: Pick<
  LiveSessionConsoleProps,
  "replacingPlaybook" | "onReplacePlaybook" | "onExit"
> & {
  playbook: LiveSessionPlaybook;
  children: ReactNode;
}) {
  const deckCount = Math.max(
    0,
    ...Object.values(playbook.stagesByRoute).map(stages =>
      stages.reduce((total, stage) => total + (stage.questions?.length ?? 0), 0)
    )
  );

  return (
    <div className="live-session">
      <div className="ls-workspace-bar">
        <details className="ls-workspace-tools">
          <summary>
            <Settings2 size={16} />
            <span>Session tools</span>
          </summary>
          <div className="ls-workspace-tools__menu">
            <div className="ls-workspace-tools__identity">
              <span>Active private playbook</span>
              <strong>{deckCount} decks</strong>
              <small>{playbook.version}</small>
            </div>
            {onReplacePlaybook && (
              <button
                type="button"
                disabled={replacingPlaybook}
                onClick={onReplacePlaybook}
              >
                {replacingPlaybook ? (
                  <RefreshCw className="ls-spin" size={16} />
                ) : (
                  <Upload size={16} />
                )}
                {replacingPlaybook ? "Updating…" : "Update playbook"}
              </button>
            )}
            {onExit && (
              <button type="button" onClick={onExit}>
                <LogOut size={16} /> Exit Session Mode
              </button>
            )}
          </div>
        </details>
      </div>
      {children}
    </div>
  );
}

export function LiveSessionConsole(props: LiveSessionConsoleProps) {
  const { playbook, loadState = "ready", loadMessage, onRetry, onExit } = props;
  if (loadState === "loading")
    return (
      <div className="live-session">
        <LoadingState />
      </div>
    );
  if (loadState === "error") {
    return (
      <div className="live-session">
        <LoadError message={loadMessage} onRetry={onRetry} onExit={onExit} />
      </div>
    );
  }
  if (!playbook) {
    return (
      <div className="live-session">
        <section className="ls-state ls-state--empty">
          <span className="ls-state__icon">
            <ShieldCheck size={28} />
          </span>
          <p className="ls-eyebrow">Tutor library</p>
          <h2>No playbook is published yet</h2>
          <p>
            Publish the private Session 01 package, then return here. Nothing
            has been exposed to the student.
          </p>
          {onExit && (
            <button
              className="ls-button ls-button--primary"
              type="button"
              onClick={onExit}
            >
              Return to Tutor Admin
            </button>
          )}
        </section>
      </div>
    );
  }
  return <LiveSessionWorkspace {...props} playbook={playbook} />;
}

function LiveSessionWorkspace({
  session,
  playbook,
  initialRun,
  syncState = "synced",
  syncMessage,
  offlineReady = false,
  onRetry,
  onPrepareOffline,
  onRemoveOffline,
  onReplacePlaybook,
  replacingPlaybook,
  onRunChange,
  onComplete,
  onExit,
}: LiveSessionConsoleProps & { playbook: LiveSessionPlaybook }) {
  const initialRouteId = preferredRouteId(playbook, initialRun?.routeId);
  const [phase, setPhase] = useState<LiveSessionPhase>(
    initialRun?.phase ?? "launch"
  );
  const [routeId, setRouteId] = useState(initialRouteId);
  const [stageIndex, setStageIndex] = useState(initialRun?.stageIndex ?? 0);
  const [questionIndex, setQuestionIndex] = useState(
    initialRun?.questionIndex ?? 0
  );
  const [evidence, setEvidence] = useState<LiveSessionEvidence[]>(
    initialRun?.evidence ?? []
  );
  const [completedDeskIds, setCompletedDeskIds] = useState<string[]>(
    initialRun?.completedDeskIds ??
      (initialRun?.evidence ?? []).map(entry =>
        sessionDeckKey(entry.stageId, entry.targetId)
      )
  );
  const [timerSnapshot, setTimerSnapshot] =
    useState<SessionTimerSnapshot | null>(initialRun?.timer ?? null);
  const [completion, setCompletion] =
    useState<LiveSessionCloseoutResult | null>(initialRun?.closeout ?? null);
  const wasRunningBeforeCloseout = useRef(false);
  const selectedRoute =
    playbook.routes.find(route => route.id === routeId) ?? playbook.routes[0];
  const stages = selectedRoute
    ? (playbook.stagesByRoute[selectedRoute.id] ?? [])
    : [];

  const handleTimerSnapshot = useCallback((snapshot: SessionTimerSnapshot) => {
    setTimerSnapshot(snapshot);
  }, []);

  const timer = useSessionTimer({
    durationMinutes: selectedRoute?.minutes ?? 120,
    initialSnapshot: initialRun?.timer,
    onSnapshotChange: handleTimerSnapshot,
  });

  useEffect(() => {
    onRunChange?.({
      phase,
      routeId: routeId || null,
      stageIndex,
      questionIndex,
      evidence,
      completedDeskIds,
      timer: timerSnapshot,
      closeout: completion,
      updatedAt: new Date().toISOString(),
    });
  }, [
    completedDeskIds,
    completion,
    evidence,
    onRunChange,
    phase,
    questionIndex,
    routeId,
    stageIndex,
    timerSnapshot,
  ]);

  const handleStart = (route: LiveSessionRoute) => {
    setRouteId(route.id);
    setStageIndex(0);
    setQuestionIndex(0);
    setEvidence([]);
    setCompletedDeskIds([]);
    setCompletion(null);
    setPhase("running");
    timer.start(route.minutes);
  };

  const requestCloseout = () => {
    wasRunningBeforeCloseout.current = timer.status === "running";
    if (timer.status === "running") timer.pause();
    setPhase("closeout");
  };

  const returnToSession = () => {
    setPhase("running");
    if (wasRunningBeforeCloseout.current && timer.status === "paused")
      timer.resume();
  };

  const finish = async (result: LiveSessionCloseoutResult) => {
    await onComplete(result);
    timer.finish();
    setCompletion(result);
    setPhase("complete");
  };

  const completionSummary = useMemo(() => {
    if (!completion) return null;
    return {
      green: completion.mastery.filter(item => item.decision === "green")
        .length,
      amber: completion.mastery.filter(item => item.decision === "amber")
        .length,
      red: completion.mastery.filter(item => item.decision === "red").length,
    };
  }, [completion]);
  const completionSyncCopy =
    syncState === "synced"
      ? "Cloud current on every tutor device."
      : syncState === "saving"
        ? "Saved on this device · syncing in the background."
        : syncState === "offline"
          ? "Saved on this device · it will sync when the connection returns."
          : "Saved on this device · cloud sync needs a retry.";

  if (!selectedRoute || !playbook.routes.length) {
    return (
      <div className="live-session">
        <LoadError
          message="This playbook does not contain a valid teaching route."
          onExit={onExit}
        />
      </div>
    );
  }

  if (phase === "launch") {
    return (
      <WorkspaceFrame
        playbook={playbook}
        replacingPlaybook={replacingPlaybook}
        onReplacePlaybook={onReplacePlaybook}
        onExit={onExit}
      >
        <SessionLaunch
          session={session}
          playbook={playbook}
          defaultRouteId={routeId}
          offlineReady={offlineReady}
          onPrepareOffline={onPrepareOffline}
          onRemoveOffline={onRemoveOffline}
          onReplacePlaybook={onReplacePlaybook}
          replacingPlaybook={replacingPlaybook}
          onStart={handleStart}
          onExit={onExit}
        />
      </WorkspaceFrame>
    );
  }

  if (phase === "closeout") {
    return (
      <WorkspaceFrame
        playbook={playbook}
        replacingPlaybook={replacingPlaybook}
        onReplacePlaybook={onReplacePlaybook}
        onExit={onExit}
      >
        <SessionCloseout
          session={session}
          route={selectedRoute}
          stages={stages}
          evidence={evidence}
          actualMinutes={Math.max(1, Math.round(timer.elapsedMs / 60_000))}
          onBack={returnToSession}
          onSubmit={finish}
        />
      </WorkspaceFrame>
    );
  }

  if (phase === "complete") {
    return (
      <WorkspaceFrame
        playbook={playbook}
        replacingPlaybook={replacingPlaybook}
        onReplacePlaybook={onReplacePlaybook}
        onExit={onExit}
      >
        <section className="ls-complete" aria-labelledby="ls-complete-title">
          <span className="ls-complete__mark">
            <CheckCircle2 size={34} />
          </span>
          <p className="ls-eyebrow">Session safely recorded</p>
          <h1 id="ls-complete-title">
            Session {String(session.number).padStart(2, "0")} is complete
          </h1>
          <p>
            The live evidence and closeout decisions have been handed to the
            tracker.
          </p>
          {completionSummary && (
            <div className="ls-complete__summary">
              <span className="is-green">
                <strong>{completionSummary.green}</strong> green
              </span>
              <span className="is-amber">
                <strong>{completionSummary.amber}</strong> amber
              </span>
              <span className="is-red">
                <strong>{completionSummary.red}</strong> red
              </span>
            </div>
          )}
          <div
            className={`ls-complete__sync ls-complete__sync--${syncState}`}
            role="status"
            title={syncMessage}
          >
            {syncState === "synced" ? (
              <CheckCircle2 size={18} />
            ) : syncState === "saving" ? (
              <RefreshCw className="ls-spin" size={18} />
            ) : (
              <CloudAlert size={18} />
            )}
            <span>{completionSyncCopy}</span>
            {(syncState === "error" || syncState === "offline") && onRetry && (
              <button type="button" onClick={onRetry}>
                <RefreshCw size={15} /> Retry now
              </button>
            )}
          </div>
          <div className="ls-complete__assurance">
            <ShieldCheck size={18} />
            <span>
              Answers and private tutor notes remain in the tutor workspace.
            </span>
          </div>
          <div className="ls-complete__actions">
            {onExit && (
              <button
                className="ls-button ls-button--primary ls-button--large"
                type="button"
                onClick={onExit}
              >
                Return to tracker <ChevronRight size={18} />
              </button>
            )}
          </div>
        </section>
      </WorkspaceFrame>
    );
  }

  return (
    <WorkspaceFrame
      playbook={playbook}
      replacingPlaybook={replacingPlaybook}
      onReplacePlaybook={onReplacePlaybook}
      onExit={onExit}
    >
      <LiveSessionRunner
        session={session}
        route={selectedRoute}
        stages={stages}
        references={playbook.references}
        timer={timer}
        evidence={evidence}
        completedDeskIds={completedDeskIds}
        initialStageIndex={stageIndex}
        initialQuestionIndex={questionIndex}
        syncState={syncState}
        syncMessage={syncMessage}
        onSyncRetry={onRetry}
        onEvidence={entry => setEvidence(current => [...current, entry])}
        onDeskCompletionChange={(deskKey, complete) => {
          setCompletedDeskIds(current => {
            const next = new Set(current);
            if (complete) next.add(deskKey);
            else next.delete(deskKey);
            return [...next];
          });
        }}
        onPositionChange={(nextStage, nextQuestion) => {
          setStageIndex(nextStage);
          setQuestionIndex(nextQuestion);
        }}
        onRequestCloseout={requestCloseout}
        onExit={onExit}
      />
    </WorkspaceFrame>
  );
}
