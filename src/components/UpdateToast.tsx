import { RefreshCw, X } from "lucide-react";
import { useEffect, useState } from "react";
import { applyUpdate, watchForUpdate } from "../lib/pwa";
import { useShellBusy } from "../lib/shellBusy";

type WaitingWorker = Pick<ServiceWorker, "postMessage">;

/**
 * "Update ready" prompt for the installed app. Appears once a new service
 * worker is waiting, never while a session or practice run is in progress
 * (it shows as soon as that ends), and reloads only when asked.
 */
export default function UpdateToast({
  registration,
}: {
  /** Resolves to the registration once the worker is registered; null when unsupported. */
  registration: Promise<ServiceWorkerRegistration | null>;
}) {
  const [waiting, setWaiting] = useState<WaitingWorker | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [reloading, setReloading] = useState(false);
  const busy = useShellBusy();

  useEffect(() => {
    let cancelled = false;
    void registration.then((instance) => {
      if (cancelled || !instance || typeof navigator === "undefined" || !navigator.serviceWorker) return;
      watchForUpdate(instance, navigator.serviceWorker, (worker) => {
        if (cancelled) return;
        setWaiting(worker);
        setDismissed(false);
      });
    });
    return () => {
      cancelled = true;
    };
  }, [registration]);

  if (!waiting || dismissed || busy) return null;

  const reload = () => {
    setReloading(true);
    applyUpdate(waiting, navigator.serviceWorker, () => window.location.reload());
  };

  return (
    <div className="toast update-toast" role="status" aria-live="polite">
      <RefreshCw size={16} aria-hidden="true" className={reloading ? "update-toast__spin" : undefined} />
      <span>{reloading ? "Updating…" : "Update ready"}</span>
      <button type="button" className="update-toast__reload" onClick={reload} disabled={reloading}>
        Reload
      </button>
      <button type="button" className="update-toast__later" onClick={() => setDismissed(true)} aria-label="Update later" disabled={reloading}>
        <X size={15} aria-hidden="true" />
      </button>
    </div>
  );
}
