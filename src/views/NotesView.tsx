// Moved out of App.tsx unchanged (P3.9 split); see git history for origin.
import { CalendarPlus, CircleAlert, Download, NotebookPen, Plus, ShieldCheck, Trash2, Upload } from "lucide-react";
import { type FormEvent, useState } from "react";
import { formatDate, todayDateOnly } from "../lib/dates";
import type { TrackerSyncStatus } from "../hooks/useTrackerSync";
import { DiagnosticsPanel } from "../components/DiagnosticsPanel";
import { useAppDialog } from "../components/AppDialog";
import type { NoteEntry, PrivateTutorNote, TrackerState } from "../types";
import { EmptyState, NOTE_CATEGORIES, cx, makeId, sortByDateDesc, syncPresentation } from "./shared";
import type { Notify, UpdateTracker } from "./shared";

export function NotesView({
  tracker,
  updateTracker,
  notify,
  onExport,
  onImport,
  onCalendarExport,
  canImport,
  syncStatus,
  syncError,
  userEmail,
  onRetrySync,
  role,
  privateTutorNotes,
  privateNotesReady,
  privateNotesBusy,
  privateNotesError,
  updatePrivateTutorNotes,
}: {
  tracker: TrackerState;
  updateTracker: UpdateTracker;
  notify: Notify;
  onExport: () => void;
  onImport: () => void;
  onCalendarExport: () => void;
  canImport: boolean;
  syncStatus: TrackerSyncStatus;
  syncError: string | null;
  userEmail: string;
  onRetrySync: () => void;
  role: "tutor" | "student";
  privateTutorNotes: PrivateTutorNote[];
  privateNotesReady: boolean;
  privateNotesBusy: boolean;
  privateNotesError: string | null;
  updatePrivateTutorNotes: (
    recipe: (notes: PrivateTutorNote[]) => PrivateTutorNote[],
  ) => Promise<void>;
}) {
  const dialog = useAppDialog();
  const [form, setForm] = useState({
    date: todayDateOnly(),
    category: NOTE_CATEGORIES[0],
    title: "",
    body: "",
    visibility: "shared" as "shared" | "private",
  });

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const { visibility, ...noteFields } = form;
    if (visibility === "private" && role === "tutor") {
      const now = new Date().toISOString();
      const entry: PrivateTutorNote = {
        id: makeId("private-note"),
        ...noteFields,
        updatedAt: now,
      };
      try {
        await updatePrivateTutorNotes((notes) => [entry, ...notes]);
        setForm((current) => ({ ...current, title: "", body: "" }));
        notify("Private tutor note saved securely.");
      } catch (error) {
        notify(error instanceof Error ? error.message : "Private note could not be saved.", "warning");
      }
      return;
    }
    const entry: NoteEntry = { id: makeId("note"), ...noteFields };
    updateTracker((current) => ({ ...current, notes: [entry, ...current.notes] }));
    setForm((current) => ({ ...current, title: "", body: "" }));
    notify("Note saved.");
  };

  const removePrivate = async (id: string) => {
    if (!await dialog.confirm("Delete this private tutor note?")) return;
    try {
      await updatePrivateTutorNotes((notes) => notes.filter((entry) => entry.id !== id));
      notify("Private tutor note deleted.");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Private note could not be deleted.", "warning");
    }
  };

  const remove = async (id: string) => {
    if (!await dialog.confirm("Delete this note?")) return;
    updateTracker((current) => ({ ...current, notes: current.notes.filter((entry) => entry.id !== id) }));
  };

  const syncCopy = syncPresentation(syncStatus);
  const SyncIcon = syncCopy.icon;

  return (
    <div className="view-stack">
      <section className="backup-panel panel">
        <div className={cx("backup-icon", syncCopy.tone)}><SyncIcon size={25} /></div>
        <div>
          <p className="eyebrow">Live cloud sync</p>
          <h3>Progress follows you to every device</h3>
          <p>
            Signed in as {userEmail}. Every change is saved to the shared tracker
            automatically; JSON export is now an optional recovery copy.
          </p>
          <span className={cx("backup-sync-status", syncCopy.tone)}>
            <SyncIcon size={14} /> {syncCopy.label}
            {syncStatus === "error" && syncError ? ` - ${syncError}` : ""}
          </span>
        </div>
        <div className="backup-actions">
          {syncStatus === "error" && (
            <button className="button button-primary" type="button" onClick={onRetrySync}>
              Try sync again
            </button>
          )}
          <button className="button button-secondary" type="button" onClick={onExport}><Download size={16} /> Export JSON</button>
          <button className="button button-secondary" type="button" onClick={onCalendarExport}><CalendarPlus size={16} /> Calendar import</button>
          {canImport && <button className="button button-secondary" type="button" onClick={onImport}><Upload size={16} /> Import JSON</button>}
        </div>
      </section>

      <section className="form-and-list">
        <form className="panel entry-form" onSubmit={submit}>
          <div className="panel-heading"><div><p className="eyebrow">New note</p><h3>Capture a decision</h3></div><Plus size={20} /></div>
          <div className="form-grid form-grid-2">
            <label><span>Date</span><input type="date" required value={form.date} onChange={(event) => setForm({ ...form, date: event.target.value })} /></label>
            <label><span>Category</span><select value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })}>{NOTE_CATEGORIES.map((category) => <option key={category}>{category}</option>)}</select></label>
            {role === "tutor" && <label><span>Visibility</span><select value={form.visibility} onChange={(event) => setForm({ ...form, visibility: event.target.value as "shared" | "private" })}><option value="shared">Shared with Hamad</option><option value="private">Private tutor note</option></select></label>}
          </div>
          <label><span>Title</span><input required maxLength={100} placeholder="A short, useful heading" value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} /></label>
          <label><span>Note</span><textarea required rows={6} maxLength={2000} placeholder="Decision, reflection, resource URL, or commitment." value={form.body} onChange={(event) => setForm({ ...form, body: event.target.value })} /></label>
          <button className="button button-primary" type="submit" disabled={privateNotesBusy}><Plus size={16} /> {form.visibility === "private" ? "Save privately" : "Save note"}</button>
        </form>

        <section className="panel log-panel">
          <div className="panel-heading"><div><p className="eyebrow">Notebook</p><h3>Project notes</h3></div><NotebookPen size={20} /></div>
          {tracker.notes.length ? (
            <div className="entry-list">
              {sortByDateDesc(tracker.notes).map((entry) => (
                <article className="note-entry" key={entry.id}>
                  <div className="log-entry-top"><div><span>{entry.category} · {formatDate(entry.date)}</span><strong>{entry.title}</strong></div><button className="icon-button icon-button-danger" type="button" onClick={() => remove(entry.id)} aria-label="Delete note"><Trash2 size={15} /></button></div>
                  <p>{entry.body}</p>
                </article>
              ))}
            </div>
          ) : <EmptyState icon={NotebookPen} title="No notes yet">Capture the first decision, commitment, or resource link.</EmptyState>}
        </section>
      </section>
      {role === "tutor" && (
        <section className="panel private-notes-panel">
          <div className="panel-heading"><div><p className="eyebrow">Tutor only</p><h3>Private coaching notes</h3></div><ShieldCheck size={20} /></div>
          <p className="fine-print">Stored in a separate tutor-only Firestore document. Hamad's account cannot read this data.</p>
          {privateNotesError && <p className="form-error"><CircleAlert size={15} />{privateNotesError}</p>}
          {!privateNotesReady ? <p>Loading private notes…</p> : privateTutorNotes.length ? (
            <div className="entry-list">
              {sortByDateDesc(privateTutorNotes).map((entry) => (
                <article className="note-entry private-note-entry" key={entry.id}>
                  <div className="log-entry-top"><div><span>{entry.category} · {formatDate(entry.date)}</span><strong>{entry.title}</strong></div><button className="icon-button icon-button-danger" disabled={privateNotesBusy} type="button" onClick={() => void removePrivate(entry.id)} aria-label="Delete private note"><Trash2 size={15} /></button></div>
                  <p>{entry.body}</p>
                </article>
              ))}
            </div>
          ) : <EmptyState icon={ShieldCheck} title="No private notes">Choose Private tutor note above when an observation should remain visible only to Mohamed.</EmptyState>}
        </section>
      )}
      {role === "tutor" && <DiagnosticsPanel />}
    </div>
  );
}
