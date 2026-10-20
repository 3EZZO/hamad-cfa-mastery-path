import { useCallback, useEffect, useRef, useState } from "react";
import { MaterialServiceError, type TeachingMaterialService } from "../../lib/cloudTeachingMaterials";
import { EMPTY_PDF_NOTES, type PdfNotes } from "./pdfNotesModel";

export type PdfNotesState = "idle" | "loading" | "saved" | "unsaved" | "saving" | "error" | "rehearsal";

const SAVE_DELAY_MS = 900;

/**
 * Page notes and key pages for the open PDF version. Every pending save
 * captures its own version, so a late save never lands on another PDF.
 * Practice mode keeps changes in memory only.
 */
export function usePdfNotes(service: TeachingMaterialService, tutorUid: string, versionId: string | null, rehearsal: boolean) {
  const [notes, setNotes] = useState<PdfNotes>(EMPTY_PDF_NOTES);
  const [state, setState] = useState<PdfNotesState>("idle");
  const [error, setError] = useState("");
  const scopeRef = useRef(versionId);
  scopeRef.current = versionId;
  const revisionRef = useRef(0);
  const pendingRef = useRef<{ versionId: string; notes: PdfNotes } | null>(null);
  const savingRef = useRef(false);
  const timerRef = useRef<number | null>(null);

  const persist = useCallback(async (pending: { versionId: string; notes: PdfNotes }) => {
    if (savingRef.current) {
      pendingRef.current = pending;
      return;
    }
    savingRef.current = true;
    if (pendingRef.current === pending) pendingRef.current = null;
    if (pending.versionId === scopeRef.current) setState("saving");
    try {
      const revision = await service.savePdfNotes(pending.versionId, pending.notes, revisionRef.current, tutorUid);
      if (pending.versionId !== scopeRef.current) return;
      revisionRef.current = revision;
      setState(pendingRef.current ? "unsaved" : "saved");
    } catch (caught) {
      if (pending.versionId !== scopeRef.current) return;
      const conflict = caught instanceof MaterialServiceError && caught.code === "conflict";
      if (!conflict && !pendingRef.current) pendingRef.current = pending;
      if (conflict) pendingRef.current = null;
      setState("error");
      setError(conflict
        ? "These notes changed on another device. Reload them before editing."
        : "Notes could not be saved. Your changes are still here; retry when online.");
    } finally {
      savingRef.current = false;
      const next = pendingRef.current;
      if (next && next !== pending && next.versionId === scopeRef.current) void persist(next);
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
    setNotes(EMPTY_PDF_NOTES);
    setError("");
    if (!versionId) {
      setState("idle");
      return;
    }
    if (rehearsal) {
      setState("rehearsal");
      return;
    }
    setState("loading");
    const loaded = versionId;
    try {
      const result = await service.loadPdfNotes(versionId);
      if (loaded !== scopeRef.current) return;
      revisionRef.current = result.revision;
      setNotes(result.notes);
      setState("saved");
    } catch {
      if (loaded !== scopeRef.current) return;
      setState("error");
      setError("Page notes could not be loaded. Teaching from the PDF still works.");
    }
  }, [rehearsal, service, versionId]);

  // A new PDF: save what was typed for the previous one, then load.
  useEffect(() => {
    void load();
    return () => flush();
  }, [flush, load]);

  const update = useCallback((next: PdfNotes) => {
    setNotes(next);
    if (rehearsal || !versionId) return;
    setState("unsaved");
    pendingRef.current = { versionId, notes: next };
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      if (pendingRef.current) void persist(pendingRef.current);
    }, SAVE_DELAY_MS);
  }, [persist, rehearsal, versionId]);

  const retry = useCallback(() => (pendingRef.current ? flush() : void load()), [flush, load]);

  return { notes, state, error, update, flush, retry };
}
