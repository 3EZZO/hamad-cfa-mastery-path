import { LockKeyhole, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { MaterialServiceError, type TeachingMaterialService } from "../../lib/cloudTeachingMaterials";
import { MAX_TUTOR_NOTE_CHARS } from "./materialTypes";

type SaveState = "loading" | "saved" | "unsaved" | "saving" | "error" | "rehearsal";

const SAVE_DELAY_MS = 900;

/**
 * Private tutor notes for one (tutor, session, PDF version). Every pending
 * write captures its own scope, so a late save always lands on the note it
 * was typed into, never on a newly selected session or document.
 */
export function TutorNotesPanel({
  service, tutorUid, runId, versionId, rehearsal, title = "Private notes",
}: {
  service: TeachingMaterialService;
  tutorUid: string;
  runId: string;
  versionId: string;
  rehearsal: boolean;
  title?: string;
}) {
  const scope = `${tutorUid}:${runId}:${versionId}`;
  const [text, setText] = useState("");
  const [state, setState] = useState<SaveState>(rehearsal ? "rehearsal" : "loading");
  const [error, setError] = useState("");
  const revisionRef = useRef(0);
  const scopeRef = useRef(scope);
  scopeRef.current = scope;
  const timerRef = useRef<number | null>(null);
  const savingRef = useRef(false);
  const pendingRef = useRef<{ scope: string; runId: string; versionId: string; text: string } | null>(null);

  const persist = useCallback(async (pending: { scope: string; runId: string; versionId: string; text: string }) => {
    if (savingRef.current) {
      pendingRef.current = pending;
      return;
    }
    savingRef.current = true;
    if (pendingRef.current === pending) pendingRef.current = null;
    if (pending.scope === scopeRef.current) setState("saving");
    try {
      const revision = await service.saveTeachingNote(pending.runId, pending.versionId, pending.text, revisionRef.current, tutorUid);
      if (pending.scope !== scopeRef.current) return;
      revisionRef.current = revision;
      setState(pendingRef.current ? "unsaved" : "saved");
    } catch (caught) {
      if (pending.scope !== scopeRef.current) return;
      const conflict = caught instanceof MaterialServiceError && caught.code === "conflict";
      // Keep unsaved text retryable unless another device wrote a newer note.
      if (!conflict && !pendingRef.current) pendingRef.current = pending;
      if (conflict) pendingRef.current = null;
      setState("error");
      setError(conflict
        ? "These notes changed on another device. Reload them before typing more."
        : "Notes could not be saved. Your text is still here; retry when online.");
    } finally {
      savingRef.current = false;
      const next = pendingRef.current;
      if (next && next !== pending && next.scope === scopeRef.current) void persist(next);
    }
  }, [service, tutorUid]);

  const flush = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const pending = pendingRef.current;
    if (pending) void persist(pending);
  }, [persist]);

  const load = useCallback(async () => {
    revisionRef.current = 0;
    setText("");
    setError("");
    if (rehearsal) {
      setState("rehearsal");
      return;
    }
    setState("loading");
    const loadedScope = scope;
    try {
      const note = await service.loadTeachingNote(runId, versionId);
      if (loadedScope !== scopeRef.current) return;
      revisionRef.current = note?.revision ?? 0;
      setText(note?.text ?? "");
      setState("saved");
    } catch {
      if (loadedScope !== scopeRef.current) return;
      setState("error");
      setError("Private notes could not be loaded. Teaching from the PDF still works.");
    }
  }, [rehearsal, runId, scope, service, versionId]);

  // New scope: save what was typed for the previous one, then load.
  useEffect(() => {
    void load();
    return () => flush();
  }, [flush, load]);

  const change = (value: string) => {
    const next = value.slice(0, MAX_TUTOR_NOTE_CHARS);
    setText(next);
    if (rehearsal) return;
    setState("unsaved");
    pendingRef.current = { scope, runId, versionId, text: next };
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      if (pendingRef.current) void persist(pendingRef.current);
    }, SAVE_DELAY_MS);
  };

  const label: Record<SaveState, string> = {
    loading: "Loading…",
    saved: "Saved privately",
    unsaved: "Unsaved changes",
    saving: "Saving…",
    error: "Not saved",
    rehearsal: "Practice — not saved",
  };

  return (
    <section className="tm-notes" aria-labelledby="tm-notes-title">
      <header>
        <h2 id="tm-notes-title"><LockKeyhole size={14} aria-hidden="true" /> {title}</h2>
        <span className={`tm-save-state${state === "error" ? " tm-save-state--error" : ""}`} role="status" aria-live="polite">{label[state]}</span>
      </header>
      <p>Only you can read these. They are never shared with the student or added to the session record.</p>
      <textarea
        aria-label="Private tutor notes for this PDF and session"
        value={text}
        disabled={state === "loading"}
        maxLength={MAX_TUTOR_NOTE_CHARS}
        onChange={event => change(event.target.value)}
        onBlur={flush}
      />
      {state === "error" && (
        <div role="alert">
          <p className="tm-save-state--error">{error}</p>
          <button type="button" className="tm-button" onClick={() => (pendingRef.current ? flush() : void load())}>
            <RefreshCw size={15} aria-hidden="true" /> {pendingRef.current ? "Retry save" : "Reload notes"}
          </button>
        </div>
      )}
    </section>
  );
}
