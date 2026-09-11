import { CircleAlert, RotateCcw } from "lucide-react";

/** Presentation only: retries the existing caller-owned operation. */
export function SyncRecoveryNotice({ state, message, onRetry }: {
  state: string;
  message?: string | null;
  onRetry?: () => void;
}) {
  if (state !== "error" && state !== "offline") return null;
  return <aside className="sync-recovery-notice" aria-label="Sync recovery">
    <CircleAlert size={20} aria-hidden="true" />
    <div role="status" aria-live="polite" aria-atomic="true">
      <strong>{state === "offline" ? "Offline — cloud sync is paused" : "Cloud sync needs attention"}</strong>
      <p>{message || (state === "offline"
        ? "Reconnect to the internet, then retry sync. Keep this device's recovery data until synchronization succeeds."
        : "Check your connection and account access, then retry sync. Do not clear device recovery data while changes are pending.")}</p>
    </div>
    {onRetry && <button className="button button-primary" type="button" onClick={onRetry}><RotateCcw size={16} aria-hidden="true" /> Retry sync</button>}
  </aside>;
}
