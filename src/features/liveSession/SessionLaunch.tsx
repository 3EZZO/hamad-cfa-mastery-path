import {
  Check,
  ChevronRight,
  Clock3,
  Play,
  ShieldCheck,
  Target,
  Upload,
} from "lucide-react";
import { useMemo, useState } from "react";
import type { SessionPreflightReport } from "./sessionPreflight";
import { SessionPreflightPanel } from "./SessionPreflightPanel";
import type {
  LiveSessionDescriptor,
  LiveSessionPlaybook,
  LiveSessionRoute,
} from "./types";

export interface SessionLaunchProps {
  session: LiveSessionDescriptor;
  playbook: LiveSessionPlaybook;
  defaultRouteId?: string;
  offlineReady?: boolean;
  preflightReport: SessionPreflightReport;
  preflightRunning?: boolean;
  preflightCheckedAt?: string | null;
  preflightMessage?: string;
  calculatorReady: boolean;
  timerReady: boolean;
  onRunPreflight: () => void | Promise<void>;
  onCalculatorReadyChange: (ready: boolean) => void;
  onTimerReadyChange: (ready: boolean) => void;
  onRouteChange?: (route: LiveSessionRoute) => void;
  onPrepareOffline?: () => void | Promise<void>;
  onRemoveOffline?: () => void | Promise<void>;
  onReplacePlaybook?: () => void;
  replacingPlaybook?: boolean;
  onStart: (route: LiveSessionRoute) => void;
  onExit?: () => void;
}

function displayDate(value: string): string {
  const parsed = new Date(`${value}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(parsed);
}

export function SessionLaunch({
  session,
  playbook,
  defaultRouteId,
  offlineReady = false,
  preflightReport,
  preflightRunning = false,
  preflightCheckedAt,
  preflightMessage,
  calculatorReady,
  timerReady,
  onRunPreflight,
  onCalculatorReadyChange,
  onTimerReadyChange,
  onRouteChange,
  onPrepareOffline,
  onRemoveOffline,
  onReplacePlaybook,
  replacingPlaybook = false,
  onStart,
  onExit,
}: SessionLaunchProps) {
  const initialRoute = useMemo(
    () =>
      playbook.routes.find(route => route.id === defaultRouteId) ??
      playbook.routes.find(route => route.recommended) ??
      playbook.routes[0],
    [defaultRouteId, playbook.routes]
  );
  const [routeId, setRouteId] = useState(initialRoute?.id ?? "");
  const [offlineBusy, setOfflineBusy] = useState(false);
  const selectedRoute =
    playbook.routes.find(route => route.id === routeId) ?? initialRoute;
  const selectedStages = selectedRoute
    ? (playbook.stagesByRoute[selectedRoute.id] ?? [])
    : [];
  const stageCount = selectedStages.length;
  const itemCount = selectedStages.reduce(
    (total, stage) => total + Math.max(1, stage.questions?.length ?? 0),
    0
  );
  const proofCount = selectedStages.reduce(
    (total, stage) =>
      total +
      (stage.questions ?? []).filter(item => item.kind === "question").length,
    0
  );
  const canStart = Boolean(
    selectedRoute && stageCount && preflightReport.canStart
  );

  const toggleOffline = async () => {
    const action = offlineReady ? onRemoveOffline : onPrepareOffline;
    if (!action) return;
    setOfflineBusy(true);
    try {
      await action();
    } finally {
      setOfflineBusy(false);
    }
  };

  return (
    <section className="ls-launch" aria-labelledby="ls-launch-title">
      <header className="ls-launch__header">
        <div className="ls-launch__mark" aria-hidden="true">
          <Target size={25} />
        </div>
        <div>
          <p className="ls-eyebrow">Tutor-only live classroom</p>
          <h1 id="ls-launch-title">
            Run Session {String(session.number).padStart(2, "0")}
          </h1>
          <p>{playbook.title}</p>
        </div>
        <div className="ls-launch__actions">
          {onReplacePlaybook && (
            <button
              className="ls-button ls-button--quiet"
              type="button"
              disabled={replacingPlaybook}
              onClick={onReplacePlaybook}
            >
              <Upload size={17} />
              {replacingPlaybook ? "Publishing..." : "Update playbook"}
            </button>
          )}
          {onExit && (
            <button
              className="ls-button ls-button--quiet"
              type="button"
              onClick={onExit}
            >
              Exit
            </button>
          )}
        </div>
      </header>

      <div className="ls-launch__session-card">
        <div>
          <span className="ls-kicker">{session.topic}</span>
          <h2>{session.title}</h2>
          <p>
            {displayDate(session.date)} at {session.startTime} -{" "}
            {session.candidateName}
          </p>
        </div>
        <div className="ls-launch__version">
          <ShieldCheck size={19} />
          <span>
            Private playbook<small>Version {playbook.version}</small>
          </span>
        </div>
      </div>

      <fieldset className="ls-route-picker">
        <legend>
          <span className="ls-step-number">1</span> Choose today&apos;s route
        </legend>
        <div className="ls-route-grid">
          {playbook.routes.map(route => {
            const selected = route.id === selectedRoute?.id;
            const routeStages = playbook.stagesByRoute[route.id] ?? [];
            const routeItems = routeStages.reduce(
              (total, stage) =>
                total + Math.max(1, stage.questions?.length ?? 0),
              0
            );
            const routeProofs = routeStages.reduce(
              (total, stage) =>
                total +
                (stage.questions ?? []).filter(item => item.kind === "question")
                  .length,
              0
            );
            return (
              <label
                className={`ls-route-card${selected ? " is-selected" : ""}`}
                key={route.id}
              >
                <input
                  type="radio"
                  name="live-session-route"
                  value={route.id}
                  checked={selected}
                  onChange={() => {
                    setRouteId(route.id);
                    onRouteChange?.(route);
                  }}
                />
                <span className="ls-route-card__check" aria-hidden="true">
                  {selected && <Check size={14} strokeWidth={3} />}
                </span>
                <span className="ls-route-card__time">
                  <Clock3 size={17} /> {route.minutes} min
                </span>
                <strong>{route.name}</strong>
                <p>{route.description}</p>
                <small>
                  {routeStages.length} stages - {routeProofs} mastery proofs -{" "}
                  {routeItems} teaching decks
                </small>
                {route.recommended && <em>Recommended</em>}
              </label>
            );
          })}
        </div>
      </fieldset>

      <fieldset className="ls-preflight">
        <legend>
          <span className="ls-step-number">2</span> Verify the teaching station
        </legend>
        <SessionPreflightPanel
          report={preflightReport}
          running={preflightRunning}
          checkedAt={preflightCheckedAt}
          message={preflightMessage}
          calculatorReady={calculatorReady}
          timerReady={timerReady}
          offlineBusy={offlineBusy}
          onRun={onRunPreflight}
          onCalculatorReadyChange={onCalculatorReadyChange}
          onTimerReadyChange={onTimerReadyChange}
          onPrepareOffline={onPrepareOffline ? toggleOffline : undefined}
          onRemoveOffline={onRemoveOffline ? toggleOffline : undefined}
        />
      </fieldset>

      <footer className="ls-launch__footer">
        <div>
          <span>Selected route</span>
          <strong>
            {selectedRoute?.name ?? "Choose a route"} - {stageCount} stages -{" "}
            {proofCount} proofs - {itemCount} decks
          </strong>
        </div>
        <button
          className="ls-button ls-button--primary ls-button--large"
          type="button"
          disabled={!canStart}
          onClick={() => selectedRoute && onStart(selectedRoute)}
        >
          <Play size={18} fill="currentColor" /> Start live session{" "}
          <ChevronRight size={18} />
        </button>
      </footer>
    </section>
  );
}
