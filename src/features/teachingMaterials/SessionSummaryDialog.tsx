import { RefreshCw, X } from "lucide-react";
import { useRef, useState } from "react";
import { useDialogFocus } from "../liveSession/useDialogFocus";
import { describePages } from "./coverageModel";

export interface SummaryRow {
  versionId: string;
  label: string;
  pages: string;
  pagesTaught: number;
  pageCount: number;
  minutes: number;
}

export interface SessionRecordInput {
  durationMinutes: number;
  outcome: string;
  nextAction: string;
  completeTask: boolean;
}

export function defaultOutcome(rows: readonly SummaryRow[]): string {
  const taught = rows.filter(row => row.pagesTaught > 0);
  if (!taught.length) return "";
  return `Taught from PDF: ${taught.map(row => `${row.label} (${describePages(row.pages)}, ${row.minutes} min)`).join("; ")}.`;
}

/**
 * What this session covered, shown when PDF teaching finishes. Nothing
 * reaches the shared session log or the task list unless the tutor chooses
 * "Finish and record"; mastery is never changed here.
 */
export function SessionSummaryDialog({
  active, sessionLabel, clockMinutes, rows, extraLine, recorded, finished, onFinishOnly, onRecord, onClose,
}: {
  active: boolean;
  sessionLabel: string;
  clockMinutes: number;
  rows: readonly SummaryRow[];
  /** e.g. "Lesson path: 5 of 7 stops reached. Quick checks: 3 of 4 correct." */
  extraLine?: string;
  recorded: boolean;
  finished: boolean;
  onFinishOnly: () => void;
  onRecord: (input: SessionRecordInput) => Promise<void>;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [outcome, setOutcome] = useState(() => [defaultOutcome(rows), extraLine ?? ""].filter(Boolean).join(" "));
  const [nextAction, setNextAction] = useState("");
  const [minutes, setMinutes] = useState(String(clockMinutes));
  const [completeTask, setCompleteTask] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useDialogFocus(active, dialogRef, headingRef, () => { if (!busy) onClose(); });
  const duration = Number(minutes);
  const valid = outcome.trim().length > 0 && Number.isFinite(duration) && duration >= 0 && duration <= 480;

  return (
    <div className="tm-dialog-backdrop" hidden={!active}>
      <div ref={dialogRef} className="tm-dialog tm-summary" role="dialog" aria-modal="true" aria-labelledby="tm-summary-title" tabIndex={-1}>
        <div className="tm-edit__head">
          <h2 id="tm-summary-title" ref={headingRef} tabIndex={-1}>{sessionLabel} · what was taught</h2>
          <button type="button" className="tm-icon" disabled={busy} onClick={onClose} aria-label="Close session summary"><X size={18} aria-hidden="true" /></button>
        </div>
        <p className="tm-dialog__hint">
          A page counts once it has been on screen for 20 seconds with the session clock running. This measures time on a page, not understanding.
        </p>
        {rows.length ? (
          <div className="tm-import__scroll"><table className="tm-summary__table">
            <thead><tr><th>PDF</th><th>Pages taught</th><th>Time</th></tr></thead>
            <tbody>
              {rows.map(row => (
                <tr key={row.versionId}>
                  <td>{row.label}</td>
                  <td>{row.pagesTaught ? `${describePages(row.pages)} · ${row.pagesTaught} of ${row.pageCount}` : "—"}</td>
                  <td>{row.minutes} min</td>
                </tr>
              ))}
            </tbody>
          </table></div>
        ) : <p className="tm-state">No PDF pages were taught with the clock running in this session.</p>}
        {extraLine && <p className="tm-dialog__hint">{extraLine}</p>}
        <form onSubmit={event => {
          event.preventDefault();
          if (!valid || busy || !active) return;
          setBusy(true); setError("");
          void onRecord({ durationMinutes: duration, outcome, nextAction, completeTask })
            .catch(caught => setError(caught instanceof Error ? caught.message : "The session log could not be saved. Try again."))
            .finally(() => setBusy(false));
        }}>
          <label>What was covered<textarea rows={3} maxLength={1000} value={outcome} disabled={busy} onChange={event => setOutcome(event.target.value)} /></label>
          <label>Next step for Hamad (optional)<textarea rows={2} maxLength={500} value={nextAction} disabled={busy}
            placeholder="For example: re-read pp. 15–20 and try the module questions." onChange={event => setNextAction(event.target.value)} /></label>
          <label>Minutes taught<input type="number" min={0} max={480} step={1} value={minutes} disabled={busy} onChange={event => setMinutes(event.target.value)} /></label>
          <label className="tm-summary__check">
            <input type="checkbox" checked={completeTask} disabled={busy} onChange={event => setCompleteTask(event.target.checked)} />
            Mark the {sessionLabel} task complete
          </label>
          {recorded && <p className="tm-dialog__hint" role="status">Already recorded in the session log. Recording again replaces that entry.</p>}
          {error && <p role="alert" className="tm-dialog__error">{error}</p>}
          <div className="tm-dialog__actions">
            {!finished && <button type="button" className="tm-button" disabled={busy} onClick={onFinishOnly}>Finish without logging</button>}
            <button type="submit" className="tm-button tm-button--primary" disabled={busy || !valid}>
              {busy && <RefreshCw className="tm-spin" size={16} aria-hidden="true" />}
              {busy ? "Saving…" : finished ? "Record in session log" : "Finish and record"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
