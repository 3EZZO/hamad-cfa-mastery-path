import { ArrowDown, ArrowUp, Copy, Play, RefreshCw, Route, X } from "lucide-react";
import { useState } from "react";
import type { LibraryEntry } from "./libraryModel";
import { MAX_LESSON_STOPS, MAX_STOP_PROMPT_CHARS, movedStop, withoutStop, withPrompt, type LessonStop } from "./lessonPathModel";
import { materialLabel } from "./materialTypes";
import type { RecordSaveState } from "./useRevisionedRecord";

const STATE_LABEL: Record<RecordSaveState, string> = {
  idle: "", loading: "Loading…", saved: "Saved privately", unsaved: "Unsaved changes",
  saving: "Saving…", error: "Not saved", rehearsal: "Practice — not saved",
};

/**
 * Builds and starts the session's lesson path from the library screen. Stops
 * are added from the reader ("Add stop"); prompts are private to the tutor.
 */
export function LessonPathPanel({
  sessionLabel, sessionNumber, stops, entries, state, error, currentStop, rehearsal,
  onChange, onStart, onRetry, onCopyFrom,
}: {
  sessionLabel: string;
  sessionNumber: number;
  stops: readonly LessonStop[];
  entries: readonly LibraryEntry[];
  state: RecordSaveState;
  error: string;
  currentStop: number;
  rehearsal: boolean;
  onChange: (stops: LessonStop[]) => void;
  onStart: (index: number) => void;
  onRetry: () => void;
  /** Appends another session's stops; resolves to a status message. */
  onCopyFrom: (sessionNumber: number) => Promise<string>;
}) {
  const [copyFrom, setCopyFrom] = useState("");
  const [copyMessage, setCopyMessage] = useState("");
  const [copying, setCopying] = useState(false);
  const busy = state === "loading";
  const labelFor = (stop: LessonStop) => {
    const entry = entries.find(item => item.version.versionId === stop.versionId);
    return entry ? materialLabel(entry.version) : "PDF no longer in the library";
  };
  const sessions = Array.from({ length: 25 }, (_, index) => index + 1).filter(number => number !== sessionNumber);

  return (
    <section className="tm-path" aria-labelledby="tm-path-title">
      <div className="tm-path__head">
        <h2 id="tm-path-title"><Route size={18} aria-hidden="true" /> Lesson path for {sessionLabel}</h2>
        <span className={`tm-save-state${state === "error" ? " tm-save-state--error" : ""}`} role="status" aria-live="polite">{STATE_LABEL[state]}</span>
      </div>
      {stops.length ? (
        <>
          <ol className="tm-path__stops">
            {stops.map((stop, index) => (
              <li key={stop.id} className={index === currentStop ? "is-current" : undefined}>
                <div className="tm-path__stop">
                  <span className="tm-path__number">{index + 1}</span>
                  <span className="tm-path__label"><strong>{labelFor(stop)}</strong><small>Page {stop.page}</small></span>
                  <span className="tm-path__actions">
                    <button type="button" className="tm-icon" aria-label={`Move stop ${index + 1} up`} disabled={busy || index === 0} onClick={() => onChange(movedStop(stops, stop.id, -1))}><ArrowUp size={16} aria-hidden="true" /></button>
                    <button type="button" className="tm-icon" aria-label={`Move stop ${index + 1} down`} disabled={busy || index === stops.length - 1} onClick={() => onChange(movedStop(stops, stop.id, 1))}><ArrowDown size={16} aria-hidden="true" /></button>
                    <button type="button" className="tm-icon" aria-label={`Remove stop ${index + 1}`} disabled={busy} onClick={() => onChange(withoutStop(stops, stop.id))}><X size={16} aria-hidden="true" /></button>
                    <button type="button" className="tm-button" disabled={busy} onClick={() => onStart(index)} aria-label={`Go to stop ${index + 1}`}><Play size={15} aria-hidden="true" /> Go</button>
                  </span>
                </div>
                <input type="text" className="tm-path__prompt" aria-label={`Private prompt for stop ${index + 1}`} maxLength={MAX_STOP_PROMPT_CHARS}
                  placeholder="Private prompt, e.g. Ask why duration falls" value={stop.prompt} disabled={busy}
                  onChange={event => onChange(withPrompt(stops, stop.id, event.target.value))} />
              </li>
            ))}
          </ol>
          <div className="tm-path__footer">
            <button type="button" className="tm-button tm-button--primary" disabled={busy} onClick={() => onStart(0)}>
              <Play size={16} aria-hidden="true" /> Start path
            </button>
            <span className="tm-material__meta">{stops.length} of {MAX_LESSON_STOPS} stops · Shift+→ / Shift+← move between stops while teaching</span>
          </div>
        </>
      ) : (
        <p className="tm-path__empty">
          No stops yet. Open a PDF, turn to a page and choose <strong>Add stop</strong>. Stops can come from several PDFs.
        </p>
      )}
      {!rehearsal && (
        <form className="tm-path__copy" onSubmit={event => {
          event.preventDefault();
          const number = Number(copyFrom);
          if (!number || copying) return;
          setCopying(true);
          setCopyMessage("");
          void onCopyFrom(number).then(setCopyMessage, () => setCopyMessage("That lesson path could not be loaded.")).finally(() => setCopying(false));
        }}>
          <label>
            <span>Copy stops from</span>
            <select value={copyFrom} disabled={busy || copying} onChange={event => setCopyFrom(event.target.value)}>
              <option value="">Choose a session</option>
              {sessions.map(number => <option key={number} value={number}>Session {String(number).padStart(2, "0")}</option>)}
            </select>
          </label>
          <button type="submit" className="tm-button" disabled={!copyFrom || busy || copying}>
            {copying ? <RefreshCw className="tm-spin" size={15} aria-hidden="true" /> : <Copy size={15} aria-hidden="true" />} Copy
          </button>
          {copyMessage && <span className="tm-material__meta" role="status">{copyMessage}</span>}
        </form>
      )}
      {state === "error" && (
        <div role="alert" className="tm-path__error">
          <span className="tm-save-state--error">{error}</span>
          <button type="button" className="tm-button" onClick={onRetry}><RefreshCw size={15} aria-hidden="true" /> Retry</button>
        </div>
      )}
    </section>
  );
}
