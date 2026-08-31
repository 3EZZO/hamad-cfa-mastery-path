import {
  Calculator,
  Check,
  CheckCircle2,
  CircleAlert,
  CloudDownload,
  LoaderCircle,
  RefreshCw,
  ShieldCheck,
  TimerReset,
} from "lucide-react";
import type {
  SessionPreflightCheck,
  SessionPreflightReport,
} from "./sessionPreflight";

export interface SessionPreflightPanelProps {
  report: SessionPreflightReport;
  running?: boolean;
  checkedAt?: string | null;
  message?: string;
  calculatorReady: boolean;
  timerReady: boolean;
  offlineBusy?: boolean;
  compact?: boolean;
  onRun: () => void | Promise<void>;
  onCalculatorReadyChange: (ready: boolean) => void;
  onTimerReadyChange: (ready: boolean) => void;
  onPrepareOffline?: () => void | Promise<void>;
  onRemoveOffline?: () => void | Promise<void>;
}

function statusCopy(check: SessionPreflightCheck): string {
  if (check.status === "ready") return "Ready";
  if (check.status === "warning") return "Protected warning";
  if (check.status === "checking") return "Check required";
  return "Action required";
}

function CheckedAt({ value }: { value?: string | null }) {
  if (!value) return <span>Not checked on this device</span>;
  const parsed = new Date(value);
  const label = Number.isNaN(parsed.getTime())
    ? value
    : new Intl.DateTimeFormat("en-GB", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      }).format(parsed);
  return <span>Last checked at {label}</span>;
}

export function SessionPreflightPanel({
  report,
  running = false,
  checkedAt,
  message,
  calculatorReady,
  timerReady,
  offlineBusy = false,
  compact = false,
  onRun,
  onCalculatorReadyChange,
  onTimerReadyChange,
  onPrepareOffline,
  onRemoveOffline,
}: SessionPreflightPanelProps) {
  const offlineCheck = report.checks.find(
    check => check.id === "offline-recovery"
  );
  const state = running
    ? "checking"
    : report.canStart && report.warningCount === 0
      ? "ready"
      : report.canStart && report.warningCount > 0
        ? "warning"
        : report.blockingCount
          ? "blocked"
          : "warning";

  return (
    <section
      className={`ls-preflight-panel ls-preflight-panel--${compact ? "compact" : "full"} is-${state}`}
      aria-labelledby={compact ? undefined : "ls-preflight-panel-title"}
    >
      <header className="ls-preflight-panel__header">
        <span className="ls-preflight-panel__mark" aria-hidden="true">
          {running ? (
            <LoaderCircle className="ls-spin" size={20} />
          ) : report.canStart && report.warningCount === 0 ? (
            <ShieldCheck size={20} />
          ) : (
            <CircleAlert size={20} />
          )}
        </span>
        <div>
          <strong id={compact ? undefined : "ls-preflight-panel-title"}>
            {running
              ? "Running the seven-point readiness scan"
              : report.canStart && report.warningCount === 0
                ? "Session systems verified"
                : report.canStart
                  ? "Ready with protected recovery"
                  : "Run the complete session preflight"}
          </strong>
          <small>
            <CheckedAt value={checkedAt} />
            {message ? ` - ${message}` : ""}
          </small>
        </div>
        <div
          className="ls-preflight-panel__score"
          aria-label={`${report.readyCount} of ${report.checks.length} checks ready`}
        >
          <strong>
            {report.readyCount}/{report.checks.length}
          </strong>
          <span>
            {report.warningCount
              ? `${report.warningCount} protected warning`
              : "ready checks"}
          </span>
        </div>
        <button
          className="ls-preflight-panel__run"
          type="button"
          disabled={running}
          onClick={() => void onRun()}
        >
          {running ? (
            <LoaderCircle className="ls-spin" size={16} />
          ) : (
            <RefreshCw size={16} />
          )}
          {running
            ? "Checking..."
            : checkedAt
              ? "Run again"
              : "Run full preflight"}
        </button>
      </header>

      <div
        className="ls-preflight-panel__checks"
        role="status"
        aria-live="polite"
      >
        {report.checks.map(check => (
          <article
            className={`ls-preflight-check is-${check.status}`}
            key={check.id}
          >
            <span className="ls-preflight-check__icon" aria-hidden="true">
              {check.status === "ready" ? (
                <CheckCircle2 size={16} />
              ) : check.status === "checking" ? (
                <LoaderCircle className={running ? "ls-spin" : ""} size={16} />
              ) : (
                <CircleAlert size={16} />
              )}
            </span>
            <span>
              <strong>{check.label}</strong>
              <small>{check.detail}</small>
            </span>
            <em>{statusCopy(check)}</em>
          </article>
        ))}
      </div>

      <div className="ls-preflight-panel__actions">
        <label className={calculatorReady ? "is-ready" : ""}>
          <input
            type="checkbox"
            checked={calculatorReady}
            onChange={event => onCalculatorReadyChange(event.target.checked)}
          />
          <span className="ls-checkbox" aria-hidden="true">
            {calculatorReady && <Check size={14} strokeWidth={3} />}
          </span>
          <Calculator size={18} />
          <span>
            <strong>Calculator confirmed</strong>
            <small>BA II Plus cleared; END mode and periodicity verified</small>
          </span>
        </label>
        <label className={timerReady ? "is-ready" : ""}>
          <input
            type="checkbox"
            checked={timerReady}
            onChange={event => onTimerReadyChange(event.target.checked)}
          />
          <span className="ls-checkbox" aria-hidden="true">
            {timerReady && <Check size={14} strokeWidth={3} />}
          </span>
          <TimerReset size={18} />
          <span>
            <strong>Teaching station confirmed</strong>
            <small>Timer, laptop power, and candidate view are ready</small>
          </span>
        </label>
        {offlineCheck && offlineCheck.status !== "ready" && onPrepareOffline ? (
          <button
            type="button"
            disabled={offlineBusy}
            onClick={() => void onPrepareOffline()}
          >
            {offlineBusy ? (
              <LoaderCircle className="ls-spin" size={16} />
            ) : (
              <CloudDownload size={16} />
            )}
            {offlineBusy ? "Preparing recovery..." : "Prepare offline recovery"}
          </button>
        ) : offlineCheck?.status === "ready" && onRemoveOffline ? (
          <button
            className="ls-preflight-panel__remove"
            type="button"
            disabled={offlineBusy}
            onClick={() => void onRemoveOffline()}
          >
            <CloudDownload size={16} /> Remove offline recovery
          </button>
        ) : null}
      </div>
    </section>
  );
}
