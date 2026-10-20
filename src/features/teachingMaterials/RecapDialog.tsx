import { RefreshCw, Send, Undo2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { MaterialServiceError, type TeachingMaterialService } from "../../lib/cloudTeachingMaterials";
import { useDialogFocus } from "../liveSession/useDialogFocus";
import { describePages } from "./coverageModel";
import { MAX_RECAP_NEXT_STEP_CHARS, recapHasContent, sanitizeRecapInput, type RecapInput, type SessionRecap } from "./recapModel";

export interface RecapKeyOption {
  versionId: string;
  pdfLabel: string;
  page: number;
  pinLabel: string;
  /** Whether the recipient can open this PDF (an active share). */
  shared: boolean;
}

/**
 * The recap the student will read, prepared from this session's record and
 * reviewed by the tutor. Only what is ticked is sent; nothing private is
 * included and no PDF is shared by sending it.
 */
export function RecapDialog({
  active, service, sessionLabel, sessionNumber, runId, recipientUid, recipientLabel,
  covered, keyOptions, checks, onClose, onSent,
}: {
  active: boolean;
  service: TeachingMaterialService;
  sessionLabel: string;
  sessionNumber: number;
  runId: string;
  recipientUid: string;
  recipientLabel: string;
  covered: readonly { label: string; pages: string }[];
  keyOptions: readonly RecapKeyOption[] | null;
  checks: { correct: number; total: number } | null;
  onClose: () => void;
  onSent: (message: string) => void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [existing, setExisting] = useState<SessionRecap | null | undefined>(undefined);
  const [coveredOn, setCoveredOn] = useState<boolean[]>(() => covered.map(() => true));
  const [keysOn, setKeysOn] = useState<Record<string, boolean>>({});
  const [checksOn, setChecksOn] = useState(true);
  const [nextStep, setNextStep] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useDialogFocus(active, dialogRef, headingRef, () => { if (!busy) onClose(); });

  useEffect(() => {
    let cancelled = false;
    void service.loadRecap(recipientUid, runId).then(recap => {
      if (cancelled) return;
      setExisting(recap);
      if (recap) setNextStep(recap.nextStep);
    }, () => { if (!cancelled) { setExisting(null); setError("The earlier recap could not be checked. Sending may report a conflict."); } });
    return () => { cancelled = true; };
  }, [recipientUid, runId, service]);

  const keyId = (option: RecapKeyOption) => `${option.versionId}:${option.page}`;
  const keyOn = (option: RecapKeyOption) => keysOn[keyId(option)] ?? option.shared;

  const input: RecapInput | null = sanitizeRecapInput({
    runId, sessionNumber,
    covered: covered.filter((_, index) => coveredOn[index]),
    keyPages: (keyOptions ?? []).filter(keyOn).map(option => ({
      versionId: option.versionId, page: option.page,
      label: option.pinLabel ? `${option.pdfLabel} — ${option.pinLabel}` : option.pdfLabel,
    })),
    checks: checksOn ? checks : null,
    nextStep,
  });
  const sendable = !!input && recapHasContent(input);
  const live = existing?.status === "active";

  const save = (status: SessionRecap["status"]) => {
    if (!input || busy) return;
    setBusy(true);
    setError("");
    void service.saveRecap(recipientUid, input, status, existing?.revision ?? 0).then(() => {
      onSent(status === "withdrawn"
        ? `The ${sessionLabel} recap was withdrawn. ${recipientLabel} no longer sees it.`
        : `${live ? "Updated" : "Sent"}. ${recipientLabel} can read the ${sessionLabel} recap under Plan › Session materials.`);
    }, caught => {
      setError(caught instanceof MaterialServiceError && caught.code === "conflict"
        ? "This recap changed on another device. Close and open it again."
        : caught instanceof MaterialServiceError && caught.code === "permission-denied"
          ? `${recipientLabel}'s account is not approved for recaps.`
          : "The recap could not be sent. Check the connection and try again.");
    }).finally(() => setBusy(false));
  };

  return (
    <div className="tm-dialog-backdrop" hidden={!active}>
      <div ref={dialogRef} className="tm-dialog tm-summary" role="dialog" aria-modal="true" aria-labelledby="tm-recap-title" tabIndex={-1}>
        <div className="tm-edit__head">
          <h2 id="tm-recap-title" ref={headingRef} tabIndex={-1}>{sessionLabel} recap for {recipientLabel}</h2>
          <button type="button" className="tm-icon" disabled={busy} onClick={onClose} aria-label="Close recap"><X size={18} aria-hidden="true" /></button>
        </div>
        <p className="tm-dialog__hint">
          Only what is ticked is sent. Private notes and stop prompts are never included, and sending does not share any PDF.
          {live ? " A recap was already sent for this session; sending again replaces it." : ""}
        </p>
        <form onSubmit={event => { event.preventDefault(); if (sendable) save("active"); }}>
          <fieldset className="tm-recap__group">
            <legend>What we covered</legend>
            {covered.length ? covered.map((row, index) => (
              <label key={row.label} className="tm-summary__check">
                <input type="checkbox" checked={coveredOn[index] ?? false} disabled={busy}
                  onChange={event => setCoveredOn(current => current.map((value, at) => (at === index ? event.target.checked : value)))} />
                {row.label} ({describePages(row.pages)})
              </label>
            )) : <p className="tm-dialog__hint">No pages were recorded as taught in this session.</p>}
          </fieldset>
          <fieldset className="tm-recap__group">
            <legend>Key pages</legend>
            {keyOptions === null ? <p className="tm-dialog__hint" role="status">Loading key pages…</p>
              : keyOptions.length ? keyOptions.map(option => (
                <label key={keyId(option)} className="tm-summary__check">
                  <input type="checkbox" checked={keyOn(option)} disabled={busy}
                    onChange={event => setKeysOn(current => ({ ...current, [keyId(option)]: event.target.checked }))} />
                  {option.pdfLabel} · p. {option.page}{option.pinLabel ? ` · ${option.pinLabel}` : ""}
                  {!option.shared && <small> (not shared with {recipientLabel}, so it shows without a link)</small>}
                </label>
              )) : <p className="tm-dialog__hint">No key pages are pinned in the PDFs taught this session.</p>}
          </fieldset>
          {checks && (
            <label className="tm-summary__check">
              <input type="checkbox" checked={checksOn} disabled={busy} onChange={event => setChecksOn(event.target.checked)} />
              Quick checks: {checks.correct} of {checks.total} correct
            </label>
          )}
          <label>Before next time (optional)
            <textarea rows={3} maxLength={MAX_RECAP_NEXT_STEP_CHARS} value={nextStep} disabled={busy}
              placeholder="For example: re-read pp. 15–20 and try the Module 4 questions." onChange={event => setNextStep(event.target.value)} />
          </label>
          {error && <p role="alert" className="tm-dialog__error">{error}</p>}
          <div className="tm-dialog__actions">
            {live && (
              <button type="button" className="tm-button" disabled={busy} onClick={() => save("withdrawn")}>
                <Undo2 size={16} aria-hidden="true" /> Withdraw recap
              </button>
            )}
            <button type="submit" className="tm-button tm-button--primary" disabled={busy || !sendable || existing === undefined}>
              {busy ? <RefreshCw className="tm-spin" size={16} aria-hidden="true" /> : <Send size={16} aria-hidden="true" />}
              {live ? "Update recap" : `Send to ${recipientLabel}`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
