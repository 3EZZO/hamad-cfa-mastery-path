import { Check, Download, Share2, Smartphone, X } from "lucide-react";
import { useEffect, useState } from "react";
import {
  type BeforeInstallPromptEvent,
  isIosDevice,
  isStandaloneDisplay,
  shouldShowIosInstallGuide,
} from "../lib/pwa";

const DISMISSED_KEY = "project-202-install-dismissed";

function currentInstalledState(): boolean {
  if (typeof window === "undefined") return false;
  const iosNavigator = navigator as Navigator & { standalone?: boolean };
  return isStandaloneDisplay(
    window.matchMedia("(display-mode: standalone)"),
    iosNavigator.standalone,
  );
}

export default function PwaInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(currentInstalledState);
  const [dismissed, setDismissed] = useState(() =>
    typeof window === "undefined"
      ? false
      : window.sessionStorage.getItem(DISMISSED_KEY) === "true",
  );
  const [iosGuideOpen, setIosGuideOpen] = useState(false);
  const iosDevice =
    typeof navigator !== "undefined" && isIosDevice(navigator.userAgent);

  useEffect(() => {
    const displayMode = window.matchMedia("(display-mode: standalone)");
    const updateInstalledState = () => setInstalled(currentInstalledState());
    const capturePrompt = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
      setDismissed(false);
    };
    const markInstalled = () => {
      setInstalled(true);
      setDeferredPrompt(null);
      setIosGuideOpen(false);
    };

    window.addEventListener("beforeinstallprompt", capturePrompt);
    window.addEventListener("appinstalled", markInstalled);
    displayMode.addEventListener?.("change", updateInstalledState);
    return () => {
      window.removeEventListener("beforeinstallprompt", capturePrompt);
      window.removeEventListener("appinstalled", markInstalled);
      displayMode.removeEventListener?.("change", updateInstalledState);
    };
  }, []);

  const dismiss = () => {
    setDismissed(true);
    setIosGuideOpen(false);
    window.sessionStorage.setItem(DISMISSED_KEY, "true");
  };

  const install = async () => {
    if (deferredPrompt) {
      await deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      if (choice.outcome === "accepted") setInstalled(true);
      setDeferredPrompt(null);
      return;
    }
    if (shouldShowIosInstallGuide(iosDevice, installed, false)) {
      setIosGuideOpen(true);
    }
  };

  if (installed || dismissed) return null;
  const installAvailable = Boolean(deferredPrompt) || iosDevice;
  if (!installAvailable) return null;

  return (
    <aside className="pwa-install-card" aria-label="Install Hamad CFA Mastery">
      <div className="pwa-install-icon">
        <Smartphone size={20} />
      </div>
      <div className="pwa-install-copy">
        <strong>Keep Hamad CFA Mastery on your home screen</strong>
        <span>
          Open the tracker like an app. Progress still synchronizes through
          Firebase whenever you are online.
        </span>
        {iosGuideOpen && (
          <div className="pwa-ios-guide" role="status">
            <Share2 size={17} />
            <p>
              In Safari, tap <strong>Share</strong>, then choose
              <strong> Add to Home Screen</strong> and confirm <strong>Add</strong>.
            </p>
          </div>
        )}
      </div>
      <div className="pwa-install-actions">
        <button className="button button-primary" type="button" onClick={() => void install()}>
          {iosGuideOpen ? <Check size={16} /> : <Download size={16} />}
          {iosGuideOpen ? "Got it" : "Install app"}
        </button>
        <button className="icon-button" type="button" onClick={dismiss} aria-label="Dismiss install suggestion">
          <X size={17} />
        </button>
      </div>
    </aside>
  );
}
