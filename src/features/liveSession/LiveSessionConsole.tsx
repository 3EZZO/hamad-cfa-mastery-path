import {
  CheckCircle2,
  ChevronRight,
  CloudAlert,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LiveSessionRunner } from "./LiveSessionRunner";
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
  initialRouteId: string | null | undefined,
): string {
  if (initialRouteId && playbook.routes.some(route => route.id === initialRouteId)) {
    return initialRouteId;
  }
  return playbook.routes.find(route => route.recommended)?.id ?? playbook.routes[0]?.id ?? "";
}

function LoadingState() {
  return (
    <section className="ls-state ls-state--loading" aria-live="polite" aria-busy="true">
      <div className="ls-loading-mark" aria-hidden="true"><span /><span /><span /></div>
      <p className="ls-eyebrow">Opening the private tutor desk</p>
      <h2>Preparing Session Mode</h2>
      <p>Validating the playbook and restoring your last safe position.</p>
      <div className="ls-skeleton-stack" aria-hidden="true"><span /><span /><span /></div>
    </section>
  );
}

function LoadError({ message, onRetry, onExit }: { message?: string; onRetry?: () => void; onExit?: () => void }) {
  return (
    <section className="ls-state ls-state--error" role="alert">
      <span className="ls-state__icon"><CloudAlert size={29} /></span>
      <p className="ls-eyebrow">Private content unavailable</p>
      <h2>The tutor desk did not open</h2>
      <p>{message || "Check your connection and tutor access, then try again."}</p>
      <div className="ls-state__actions">
        {onRetry && <button className="ls-button ls-button--primary" type="button" onClick={onRetry}><RefreshCw size={17} /> Try again</button>}
        {onExit && <button className="ls-button ls-button--quiet" type="button" onClick={onExit}>Return to tracker</button>}
      </div>
    </section>
  );
}

export function LiveSessionConsole(props: LiveSessionConsoleProps) {
  const { playbook, loadState = "ready", loadMessage, onRetry, onExit } = props;
  if (loadState === "loading") return <div className="live-session"><LoadingState /></div>;
  if (loadState === "error") {
    return <div className="live-session"><LoadError message={loadMessage} onRetry={onRetry} onExit={onExit} /></div>;
  }
  if (!playbook) {
    return (
      <div className="live-session">
        <section className="ls-state ls-state--empty">
          <span className="ls-state__icon"><ShieldCheck size={28} /></span>
          <p className="ls-eyebrow">Tutor library</p>
          <h2>No playbook is published yet</h2>
          <p>Publish the private Session 01 package, then return here. Nothing has been exposed to the student.</p>
          {onExit && <button className="ls-button ls-button--primary" type="button" onClick={onExit}>Return to Tutor Admin</button>}
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
  onPrepareOffline,
  onRemoveOffline,
  onRunChange,
  onComplete,
  onExit,
}: LiveSessionConsoleProps & { playbook: LiveSessionPlaybook }) {
  const initialRouteId = preferredRouteId(playbook, initialRun?.routeId);
  const [phase, setPhase] = useState<LiveSessionPhase>(initialRun?.phase ?? "launch");
  const [routeId, setRouteId] = useState(initialRouteId);
  const [stageIndex, setStageIndex] = useState(initialRun?.stageIndex ?? 0);
  const [questionIndex, setQuestionIndex] = useState(initialRun?.questionIndex ?? 0);
  const [evidence, setEvidence] = useState<LiveSessionEvidence[]>(initialRun?.evidence ?? []);
  const [timerSnapshot, setTimerSnapshot] = useState<SessionTimerSnapshot | null>(initialRun?.timer ?? null);
  const [completion, setCompletion] = useState<LiveSessionCloseoutResult | null>(null);
  const wasRunningBeforeCloseout = useRef(false);
  const selectedRoute = playbook.routes.find(route => route.id === routeId) ?? playbook.routes[0];
  const stages = selectedRoute ? playbook.stagesByRoute[selectedRoute.id] ?? [] : [];

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
      timer: timerSnapshot,
      updatedAt: new Date().toISOString(),
    });
  }, [evidence, onRunChange, phase, questionIndex, routeId, stageIndex, timerSnapshot]);

  const handleStart = (route: LiveSessionRoute) => {
    setRouteId(route.id);
    setStageIndex(0);
    setQuestionIndex(0);
    setEvidence([]);
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
    if (wasRunningBeforeCloseout.current && timer.status === "paused") timer.resume();
  };

  const finish = async (result: LiveSessionCloseoutResult) => {
    await onComplete(result);
    timer.finish();
    setCompletion(result);
    setPhase("complete");
  };

  const restart = () => {
    const approved = window.confirm("Return to the launch screen? Your completed record remains saved.");
    if (!approved) return;
    timer.reset(selectedRoute?.minutes);
    setEvidence([]);
    setStageIndex(0);
    setQuestionIndex(0);
    setCompletion(null);
    setPhase("launch");
  };

  const completionSummary = useMemo(() => {
    if (!completion) return null;
    return {
      green: completion.mastery.filter(item => item.decision === "green").length,
      amber: completion.mastery.filter(item => item.decision === "amber").length,
      red: completion.mastery.filter(item => item.decision === "red").length,
    };
  }, [completion]);

  if (!selectedRoute || !playbook.routes.length) {
    return (
      <div className="live-session">
        <LoadError message="This playbook does not contain a valid teaching route." onExit={onExit} />
      </div>
    );
  }

  if (phase === "launch") {
    return (
      <div className="live-session">
        <SessionLaunch
          session={session}
          playbook={playbook}
          defaultRouteId={routeId}
          offlineReady={offlineReady}
          onPrepareOffline={onPrepareOffline}
          onRemoveOffline={onRemoveOffline}
          onStart={handleStart}
          onExit={onExit}
        />
      </div>
    );
  }

  if (phase === "closeout") {
    return (
      <div className="live-session">
        <SessionCloseout
          session={session}
          route={selectedRoute}
          stages={stages}
          evidence={evidence}
          actualMinutes={Math.max(1, Math.round(timer.elapsedMs / 60_000))}
          onBack={returnToSession}
          onSubmit={finish}
        />
      </div>
    );
  }

  if (phase === "complete") {
    return (
      <div className="live-session">
        <section className="ls-complete" aria-labelledby="ls-complete-title">
          <span className="ls-complete__mark"><CheckCircle2 size={34} /></span>
          <p className="ls-eyebrow">Session safely recorded</p>
          <h1 id="ls-complete-title">Session {String(session.number).padStart(2, "0")} is complete</h1>
          <p>The live evidence and closeout decisions have been handed to the tracker.</p>
          {completionSummary && (
            <div className="ls-complete__summary">
              <span className="is-green"><strong>{completionSummary.green}</strong> green</span>
              <span className="is-amber"><strong>{completionSummary.amber}</strong> amber</span>
              <span className="is-red"><strong>{completionSummary.red}</strong> red</span>
            </div>
          )}
          <div className="ls-complete__assurance"><ShieldCheck size={18} /><span>Answers and private tutor notes remain in the tutor workspace.</span></div>
          <div className="ls-complete__actions">
            <button className="ls-button ls-button--quiet" type="button" onClick={restart}><RotateCcw size={17} /> Return to launch</button>
            {onExit && <button className="ls-button ls-button--primary ls-button--large" type="button" onClick={onExit}>Return to tracker <ChevronRight size={18} /></button>}
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="live-session">
      <LiveSessionRunner
        session={session}
        route={selectedRoute}
        stages={stages}
        references={playbook.references}
        timer={timer}
        evidence={evidence}
        initialStageIndex={stageIndex}
        initialQuestionIndex={questionIndex}
        syncState={syncState}
        syncMessage={syncMessage}
        onEvidence={entry => setEvidence(current => [...current, entry])}
        onPositionChange={(nextStage, nextQuestion) => {
          setStageIndex(nextStage);
          setQuestionIndex(nextQuestion);
        }}
        onRequestCloseout={requestCloseout}
        onExit={onExit}
      />
    </div>
  );
}
