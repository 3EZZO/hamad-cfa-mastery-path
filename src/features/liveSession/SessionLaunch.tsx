import {
  Calculator,
  Check,
  ChevronRight,
  Clock3,
  CloudDownload,
  Play,
  ShieldCheck,
  Target,
  Trash2,
  Upload,
} from "lucide-react";
import { useMemo, useState } from "react";
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
  onPrepareOffline,
  onRemoveOffline,
  onReplacePlaybook,
  replacingPlaybook = false,
  onStart,
  onExit,
}: SessionLaunchProps) {
  const initialRoute = useMemo(
    () => playbook.routes.find(route => route.id === defaultRouteId)
      ?? playbook.routes.find(route => route.recommended)
      ?? playbook.routes[0],
    [defaultRouteId, playbook.routes],
  );
  const [routeId, setRouteId] = useState(initialRoute?.id ?? "");
  const [calculatorReady, setCalculatorReady] = useState(false);
  const [workspaceReady, setWorkspaceReady] = useState(false);
  const [offlineBusy, setOfflineBusy] = useState(false);
  const selectedRoute = playbook.routes.find(route => route.id === routeId) ?? initialRoute;
  const stageCount = selectedRoute ? (playbook.stagesByRoute[selectedRoute.id]?.length ?? 0) : 0;
  const itemCount = selectedRoute
    ? (playbook.stagesByRoute[selectedRoute.id] ?? []).reduce(
        (total, stage) => total + Math.max(1, stage.questions?.length ?? 0),
        0,
      )
    : 0;
  const proofCount = selectedRoute
    ? (playbook.stagesByRoute[selectedRoute.id] ?? []).reduce(
        (total, stage) =>
          total + (stage.questions ?? []).filter(item => item.kind === "question").length,
        0,
      )
    : 0;
  const canStart = Boolean(selectedRoute && stageCount && calculatorReady && workspaceReady);

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
        <div className="ls-launch__mark" aria-hidden="true"><Target size={25} /></div>
        <div>
          <p className="ls-eyebrow">Tutor-only live classroom</p>
          <h1 id="ls-launch-title">Run Session {String(session.number).padStart(2, "0")}</h1>
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
              {replacingPlaybook ? "Publishing…" : "Update playbook"}
            </button>
          )}
          {onExit && <button className="ls-button ls-button--quiet" type="button" onClick={onExit}>Exit</button>}
        </div>
      </header>

      <div className="ls-launch__session-card">
        <div>
          <span className="ls-kicker">{session.topic}</span>
          <h2>{session.title}</h2>
          <p>{displayDate(session.date)} at {session.startTime} · {session.candidateName}</p>
        </div>
        <div className="ls-launch__version">
          <ShieldCheck size={19} />
          <span>Private playbook<small>Version {playbook.version}</small></span>
        </div>
      </div>

      <fieldset className="ls-route-picker">
        <legend><span className="ls-step-number">1</span> Choose today&apos;s route</legend>
        <div className="ls-route-grid">
          {playbook.routes.map(route => {
            const selected = route.id === selectedRoute?.id;
            const routeStages = playbook.stagesByRoute[route.id]?.length ?? 0;
            const routeItems = (playbook.stagesByRoute[route.id] ?? []).reduce(
              (total, stage) => total + Math.max(1, stage.questions?.length ?? 0),
              0,
            );
            const routeProofs = (playbook.stagesByRoute[route.id] ?? []).reduce(
              (total, stage) =>
                total +
                (stage.questions ?? []).filter(item => item.kind === "question")
                  .length,
              0,
            );
            return (
              <label className={`ls-route-card${selected ? " is-selected" : ""}`} key={route.id}>
                <input type="radio" name="live-session-route" value={route.id} checked={selected} onChange={() => setRouteId(route.id)} />
                <span className="ls-route-card__check" aria-hidden="true">{selected && <Check size={14} strokeWidth={3} />}</span>
                <span className="ls-route-card__time"><Clock3 size={17} /> {route.minutes} min</span>
                <strong>{route.name}</strong>
                <p>{route.description}</p>
                <small>{routeStages} stages · {routeProofs} mastery proofs · {routeItems} teaching desks</small>
                {route.recommended && <em>Recommended</em>}
              </label>
            );
          })}
        </div>
      </fieldset>

      <fieldset className="ls-preflight">
        <legend><span className="ls-step-number">2</span> Thirty-second preflight</legend>
        <div className="ls-preflight__grid">
          <label className={calculatorReady ? "is-ready" : ""}>
            <input type="checkbox" checked={calculatorReady} onChange={event => setCalculatorReady(event.target.checked)} />
            <span className="ls-checkbox" aria-hidden="true">{calculatorReady && <Check size={14} strokeWidth={3} />}</span>
            <Calculator size={19} />
            <span><strong>Calculator ready</strong><small>BA II Plus cleared and in END mode</small></span>
          </label>
          <label className={workspaceReady ? "is-ready" : ""}>
            <input type="checkbox" checked={workspaceReady} onChange={event => setWorkspaceReady(event.target.checked)} />
            <span className="ls-checkbox" aria-hidden="true">{workspaceReady && <Check size={14} strokeWidth={3} />}</span>
            <Target size={19} />
            <span><strong>Workspace ready</strong><small>Laptop charged; timer and candidate view available</small></span>
          </label>
          <article className={`ls-offline-card${offlineReady ? " is-ready" : ""}`}>
            <span className="ls-offline-card__icon">{offlineReady ? <Check size={18} /> : <CloudDownload size={18} />}</span>
            <span><strong>{offlineReady ? "Offline copy ready" : "Online-only right now"}</strong><small>{offlineReady ? "This session can survive a connection drop" : "Recommended before leaving for the session"}</small></span>
            {(onPrepareOffline || onRemoveOffline) && (
              <button type="button" disabled={offlineBusy} onClick={() => void toggleOffline()}>
                {offlineReady ? <Trash2 size={15} /> : <CloudDownload size={15} />}
                {offlineBusy ? "Working…" : offlineReady ? "Remove" : "Prepare"}
              </button>
            )}
          </article>
        </div>
      </fieldset>

      <footer className="ls-launch__footer">
        <div><span>Selected route</span><strong>{selectedRoute?.name ?? "Choose a route"} · {stageCount} stages · {proofCount} proofs · {itemCount} desks</strong></div>
        <button className="ls-button ls-button--primary ls-button--large" type="button" disabled={!canStart} onClick={() => selectedRoute && onStart(selectedRoute)}>
          <Play size={18} fill="currentColor" /> Start live session <ChevronRight size={18} />
        </button>
      </footer>
    </section>
  );
}
