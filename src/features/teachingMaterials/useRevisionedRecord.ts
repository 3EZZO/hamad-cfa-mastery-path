import { useCallback, useEffect, useRef, useState } from "react";
import { MaterialServiceError } from "../../lib/cloudTeachingMaterials";

export type RecordSaveState = "idle" | "loading" | "saved" | "unsaved" | "saving" | "error" | "rehearsal";

const SAVE_DELAY_MS = 900;

/**
 * A small private tutor record edited in place and saved by compare-and-set.
 * Every pending save captures its own key, so a late save never lands on a
 * record opened afterwards. Practice mode keeps changes in memory only.
 */
export function useRevisionedRecord<T>({ recordKey, rehearsal, empty, load, save, messages }: {
  /** The record being edited; null means none. */
  recordKey: string | null;
  rehearsal: boolean;
  empty: T;
  load: (key: string) => Promise<{ value: T; revision: number }>;
  save: (key: string, value: T, expectedRevision: number) => Promise<number>;
  messages: { load: string; save: string; conflict: string };
}) {
  const [value, setValue] = useState<T>(empty);
  const [state, setState] = useState<RecordSaveState>("idle");
  const [error, setError] = useState("");
  const scopeRef = useRef(recordKey);
  scopeRef.current = recordKey;
  const revisionRef = useRef(0);
  const pendingRef = useRef<{ key: string; value: T } | null>(null);
  const savingRef = useRef(false);
  const timerRef = useRef<number | null>(null);
  const io = useRef({ load, save, messages, empty });
  io.current = { load, save, messages, empty };

  const persist = useCallback(async (pending: { key: string; value: T }) => {
    if (savingRef.current) {
      pendingRef.current = pending;
      return;
    }
    savingRef.current = true;
    if (pendingRef.current === pending) pendingRef.current = null;
    if (pending.key === scopeRef.current) setState("saving");
    try {
      const revision = await io.current.save(pending.key, pending.value, revisionRef.current);
      if (pending.key !== scopeRef.current) return;
      revisionRef.current = revision;
      setState(pendingRef.current ? "unsaved" : "saved");
    } catch (caught) {
      if (pending.key !== scopeRef.current) return;
      const conflict = caught instanceof MaterialServiceError && caught.code === "conflict";
      if (!conflict && !pendingRef.current) pendingRef.current = pending;
      if (conflict) pendingRef.current = null;
      setState("error");
      setError(conflict ? io.current.messages.conflict : io.current.messages.save);
    } finally {
      savingRef.current = false;
      const next = pendingRef.current;
      if (next && next !== pending && next.key === scopeRef.current) void persist(next);
    }
  }, []);

  const flush = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const pending = pendingRef.current;
    if (pending) void persist(pending);
  }, [persist]);

  const reload = useCallback(async () => {
    revisionRef.current = 0;
    setValue(io.current.empty);
    setError("");
    if (!recordKey) {
      setState("idle");
      return;
    }
    if (rehearsal) {
      setState("rehearsal");
      return;
    }
    setState("loading");
    const loaded = recordKey;
    try {
      const result = await io.current.load(recordKey);
      if (loaded !== scopeRef.current) return;
      revisionRef.current = result.revision;
      setValue(result.value);
      setState("saved");
    } catch {
      if (loaded !== scopeRef.current) return;
      setState("error");
      setError(io.current.messages.load);
    }
  }, [recordKey, rehearsal]);

  // A new record: save what was typed for the previous one, then load.
  useEffect(() => {
    void reload();
    return () => flush();
  }, [flush, reload]);

  const update = useCallback((next: T) => {
    setValue(next);
    if (rehearsal || !recordKey) return;
    setState("unsaved");
    pendingRef.current = { key: recordKey, value: next };
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      if (pendingRef.current) void persist(pendingRef.current);
    }, SAVE_DELAY_MS);
  }, [persist, rehearsal, recordKey]);

  const retry = useCallback(() => (pendingRef.current ? flush() : void reload()), [flush, reload]);

  return { value, state, error, update, flush, retry };
}
