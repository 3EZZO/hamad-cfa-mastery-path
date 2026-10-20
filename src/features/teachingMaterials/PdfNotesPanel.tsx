import { LockKeyhole, Pin, PinOff, RefreshCw } from "lucide-react";
import { useState } from "react";
import type { TeachingMaterialService } from "../../lib/cloudTeachingMaterials";
import { teachingRunIdFor } from "../liveSession/teachingHost";
import {
  keyPageLabel, MAX_KEY_LABEL_CHARS, MAX_PAGE_NOTE_CHARS, noteForPage, withKeyPage, withoutKeyPage, withPageNote,
  type PdfNotes,
} from "./pdfNotesModel";
import { TutorNotesPanel } from "./TutorNotesPanel";
import type { PdfNotesState } from "./usePdfNotes";

interface EarlierNote { key: string; heading: string; text: string }

const STATE_LABEL: Record<PdfNotesState, string> = {
  idle: "",
  loading: "Loading…",
  saved: "Saved privately",
  unsaved: "Unsaved changes",
  saving: "Saving…",
  error: "Not saved",
  rehearsal: "Practice — not saved",
};

/**
 * Private notes beside the page: a note for the current page and pinned key
 * pages (both kept with the PDF across sessions), this session's notes, and
 * earlier notes on request. Never shown while presenting.
 */
export function PdfNotesPanel({
  service, tutorUid, runId, sessionNumber, versionId, page, rehearsal,
  notes, state, error, onUpdate, onFlush, onRetry, onJump, earlierVersions, stopPrompt,
}: {
  service: TeachingMaterialService;
  tutorUid: string;
  runId: string;
  sessionNumber: number;
  versionId: string;
  page: number;
  rehearsal: boolean;
  notes: PdfNotes;
  state: PdfNotesState;
  error: string;
  onUpdate: (notes: PdfNotes) => void;
  onFlush: () => void;
  onRetry: () => void;
  onJump: (page: number) => void;
  /** Other versions of the same PDF, newest first. */
  earlierVersions: readonly { versionId: string; label: string }[];
  /** The lesson-path stop on this page, with its private prompt. */
  stopPrompt?: { number: number; prompt: string } | null;
}) {
  const [full, setFull] = useState("");
  const [pinLabel, setPinLabel] = useState("");
  const [earlier, setEarlier] = useState<EarlierNote[] | null>(null);
  const [earlierLoading, setEarlierLoading] = useState(false);
  const pageNote = noteForPage(notes, page);
  const keyPage = notes.keyPages.find(entry => entry.page === page);
  const otherNotes = notes.pages.filter(entry => entry.page !== page);
  const busy = state === "loading";

  const apply = (next: PdfNotes | null, message: string) => {
    if (!next) { setFull(message); return; }
    setFull("");
    onUpdate(next);
  };

  const loadEarlier = async () => {
    if (earlier || earlierLoading || rehearsal) return;
    setEarlierLoading(true);
    const sessions = Array.from({ length: Math.max(0, Math.min(sessionNumber, 26) - 1) }, (_, index) => index + 1);
    const [sessionNotes, versionNotes] = await Promise.all([
      Promise.all(sessions.map(number => service.loadTeachingNote(teachingRunIdFor(number), versionId).then(
        note => (note?.text.trim() ? [{ key: `s${number}`, heading: `Session ${String(number).padStart(2, "0")}`, text: note.text }] : []),
        () => [],
      ))),
      Promise.all(earlierVersions.map(version => service.loadPdfNotes(version.versionId).then(
        result => result.notes.pages.map(entry => ({ key: `${version.versionId}:${entry.page}`, heading: `Earlier version · ${version.label} · p. ${entry.page}`, text: entry.text })),
        () => [],
      ))),
    ]);
    setEarlier([...sessionNotes.flat().reverse(), ...versionNotes.flat()]);
    setEarlierLoading(false);
  };

  return (
    <section className="tm-notes tm-pagenotes" aria-labelledby="tm-pagenotes-title">
      <header>
        <h2 id="tm-pagenotes-title"><LockKeyhole size={14} aria-hidden="true" /> Private notes</h2>
        <span className={`tm-save-state${state === "error" ? " tm-save-state--error" : ""}`} role="status" aria-live="polite">{STATE_LABEL[state]}</span>
      </header>
      <p>Only you can read these. They stay with this PDF across sessions and are hidden while presenting. Press N to show or hide them.</p>

      {stopPrompt && (
        <div className="tm-pagenotes__stop" role="note">
          <strong>Stop {stopPrompt.number}</strong>
          <span>{stopPrompt.prompt || "No prompt for this stop."}</span>
        </div>
      )}

      <label className="tm-pagenotes__field">
        <span>Page {page}</span>
        <textarea
          value={pageNote}
          disabled={busy}
          maxLength={MAX_PAGE_NOTE_CHARS}
          placeholder="A note for this page, kept for next time."
          onChange={event => apply(withPageNote(notes, page, event.target.value), "This PDF already has notes on 100 pages. Clear one first.")}
          onBlur={onFlush}
        />
      </label>

      <div className="tm-pagenotes__pin">
        {keyPage ? (
          <>
            <input type="text" aria-label={`Label for key page ${page}`} value={keyPage.label} maxLength={MAX_KEY_LABEL_CHARS} disabled={busy}
              placeholder="Label" onChange={event => apply(withKeyPage(notes, page, event.target.value), "")} onBlur={onFlush} />
            <button type="button" className="tm-button" disabled={busy} onClick={() => apply(withoutKeyPage(notes, page), "")}>
              <PinOff size={15} aria-hidden="true" /> Unpin
            </button>
          </>
        ) : (
          <>
            <input type="text" aria-label={`Label for page ${page}`} value={pinLabel} maxLength={MAX_KEY_LABEL_CHARS} disabled={busy}
              placeholder="Label, e.g. Duration formula" onChange={event => setPinLabel(event.target.value)} />
            <button type="button" className="tm-button" disabled={busy} onClick={() => {
              apply(withKeyPage(notes, page, pinLabel), "This PDF already has 50 key pages. Unpin one first.");
              setPinLabel("");
            }}>
              <Pin size={15} aria-hidden="true" /> Pin page {page}
            </button>
          </>
        )}
      </div>
      {full && <p className="tm-save-state--error" role="alert">{full}</p>}

      {notes.keyPages.length > 0 && (
        <div className="tm-pagenotes__list">
          <h3>Key pages</h3>
          <ul>
            {notes.keyPages.map(entry => (
              <li key={entry.page}>
                <button type="button" className={`tm-chip${entry.page === page ? " is-current" : ""}`} aria-current={entry.page === page ? "page" : undefined} onClick={() => onJump(entry.page)}>
                  {keyPageLabel(entry)}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {otherNotes.length > 0 && (
        <div className="tm-pagenotes__list">
          <h3>Notes on other pages</h3>
          <ul>
            {otherNotes.map(entry => (
              <li key={entry.page}>
                <button type="button" className="tm-chip" title={entry.text.slice(0, 120)} onClick={() => onJump(entry.page)}>p. {entry.page}</button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {state === "error" && (
        <div role="alert">
          <p className="tm-save-state--error">{error}</p>
          <button type="button" className="tm-button" onClick={onRetry}><RefreshCw size={15} aria-hidden="true" /> Retry</button>
        </div>
      )}

      <TutorNotesPanel service={service} tutorUid={tutorUid} runId={runId} versionId={versionId} rehearsal={rehearsal} title="This session’s notes" />

      {!rehearsal && (
        <details className="tm-pagenotes__earlier" onToggle={event => { if (event.currentTarget.open) void loadEarlier(); }}>
          <summary>Earlier notes on this PDF</summary>
          {earlierLoading ? <p role="status">Loading earlier notes…</p>
            : earlier && !earlier.length ? <p>No notes from earlier sessions or earlier versions.</p>
              : earlier?.map(item => (
                <article key={item.key}>
                  <h3>{item.heading}</h3>
                  <p>{item.text}</p>
                </article>
              ))}
        </details>
      )}
    </section>
  );
}
