import { RefreshCw, Send, ShieldOff, X } from "lucide-react";
import { useRef, useState } from "react";
import { useDialogFocus } from "../liveSession/useDialogFocus";
import {
  materialLabel, MAX_GRANT_MESSAGE, receiptCountsAsOpened,
  type MaterialGrant, type MaterialReceipt, type TeachingMaterialVersion,
} from "./materialTypes";

export interface ShareRecipient {
  uid: string;
  label: string;
}

export interface ShareMaterialDialogProps {
  version: TeachingMaterialVersion;
  recipients: ShareRecipient[];
  recipientUid: string | null;
  onRecipientChange: (uid: string) => void;
  grant: MaterialGrant | null;
  receipt: MaterialReceipt | null;
  sessionNumber: number;
  disabledReason?: string;
  onSend: (message: string) => Promise<string>;
  onRevoke: () => Promise<void>;
  onClose: () => void;
}

function formatWhen(ms: number | null): string {
  if (ms === null) return "just now";
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(ms));
}

/**
 * Deliberate in-app publication of one exact PDF version to one approved
 * student. No email, SMS or public link is produced.
 */
export function ShareMaterialDialog({
  version, recipients, recipientUid, onRecipientChange, grant, receipt, sessionNumber,
  disabledReason, onSend, onRevoke, onClose,
}: ShareMaterialDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState("");
  const [confirmRevoke, setConfirmRevoke] = useState(false);
  useDialogFocus(true, dialogRef, closeRef, onClose);

  const recipient = recipients.find(item => item.uid === recipientUid) ?? null;
  const active = grant?.status === "active";
  const opened = receiptCountsAsOpened(receipt, grant);
  const recipientName = recipient?.label ?? "the student";

  const run = async (work: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try {
      await work();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The request failed. Nothing was changed; try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="tm-dialog-backdrop">
      <div ref={dialogRef} className="tm-dialog" role="dialog" aria-modal="true" aria-labelledby="tm-share-title" tabIndex={-1}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
          <div>
            <h2 id="tm-share-title">Share with {recipient ? recipient.label : "a student"}</h2>
            <p className="tm-dialog__hint">Only this exact version is shared. Your notes and the rest of your library stay private.</p>
          </div>
          <button ref={closeRef} type="button" className="tm-icon" aria-label="Close sharing" onClick={onClose}>
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <dl>
          <dt>PDF</dt>
          <dd>{materialLabel(version)}</dd>
          <dt>Version</dt>
          <dd>{version.sourceEdition} edition · {version.pageCount} pages · <code>{version.sha256.slice(0, 10)}</code></dd>
          <dt>Session</dt>
          <dd>Session {String(sessionNumber).padStart(2, "0")}</dd>
          <dt>Status</dt>
          <dd>
            {!grant && "Not shared"}
            {grant?.status === "revoked" && `Access removed ${formatWhen(grant.revokedAtMs)}`}
            {active && (opened
              ? `Shared · opened ${formatWhen(receipt?.firstOpenedAtMs ?? null)}`
              : `Shared ${formatWhen(grant!.sharedAtMs)} · not opened yet`)}
          </dd>
        </dl>

        {recipients.length > 1 && (
          <label>
            <span>Recipient</span>
            <select value={recipientUid ?? ""} onChange={event => onRecipientChange(event.target.value)}>
              <option value="" disabled>Choose a student</option>
              {recipients.map(item => <option key={item.uid} value={item.uid}>{item.label}</option>)}
            </select>
          </label>
        )}

        {disabledReason ? (
          <p className="tm-notice" role="status">{disabledReason}</p>
        ) : (
          <label>
            <span>Short message (optional)</span>
            <textarea
              rows={3}
              maxLength={MAX_GRANT_MESSAGE}
              value={message}
              placeholder="e.g. Review pages 2–3 before Saturday."
              onChange={event => setMessage(event.target.value)}
            />
          </label>
        )}

        {error && <p className="tm-dialog__error" role="alert">{error}</p>}
        {result && <p className="tm-dialog__hint" role="status">{result}</p>}
        <p className="tm-dialog__hint">Opening a shared PDF is recorded as “Opened”. It is not evidence of understanding and does not change progress or tasks.</p>

        {confirmRevoke ? (
          <div className="tm-dialog__actions" role="group" aria-label="Confirm removing access">
            <p style={{ flexBasis: "100%", margin: 0 }}>
              Remove {recipientName}&apos;s access to this version? The PDF closes on their device when detected. Bytes already viewed cannot be recalled.
            </p>
            <button type="button" className="tm-button" disabled={busy} onClick={() => setConfirmRevoke(false)}>Keep access</button>
            <button
              type="button"
              className="tm-button tm-button--danger"
              disabled={busy}
              onClick={() => void run(async () => {
                await onRevoke();
                setConfirmRevoke(false);
                setResult(`Access removed for ${recipientName}.`);
              })}
            >
              {busy ? <RefreshCw className="tm-spin" size={16} aria-hidden="true" /> : <ShieldOff size={16} aria-hidden="true" />}
              Remove access
            </button>
          </div>
        ) : (
          <div className="tm-dialog__actions">
            {active && (
              <button type="button" className="tm-button tm-button--danger" disabled={busy || Boolean(disabledReason)} onClick={() => setConfirmRevoke(true)}>
                <ShieldOff size={16} aria-hidden="true" /> Remove {recipientName}&apos;s access
              </button>
            )}
            <button
              type="button"
              className="tm-button tm-button--primary"
              disabled={busy || !recipient || Boolean(disabledReason)}
              onClick={() => void run(async () => {
                const outcome = await onSend(message);
                setResult(outcome);
                setMessage("");
              })}
            >
              {busy ? <RefreshCw className="tm-spin" size={16} aria-hidden="true" /> : <Send size={16} aria-hidden="true" />}
              {active ? `Send again to ${recipientName}` : `Send to ${recipientName}`}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
