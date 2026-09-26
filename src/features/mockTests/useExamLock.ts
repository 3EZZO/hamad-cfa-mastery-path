import { useCallback, useEffect, useRef, useState } from "react";
import type { MockIncidentType } from "../../lib/mockTestContent";

/**
 * Browsers cannot stop a candidate leaving, so the exam lock does three
 * things instead: asks for full screen, notices every way out (Esc, tab or
 * app switch, focus loss, page hide) and reports each one so it can be logged
 * with a timestamp and shown to the tutor. iPhone Safari has no element
 * Fullscreen API; there the fixed exam overlay stands in for full screen and
 * tab switches are still recorded.
 */
export function fullscreenSupported(): boolean {
  return typeof document !== "undefined"
    && typeof document.documentElement.requestFullscreen === "function"
    && document.fullscreenEnabled !== false;
}

export async function enterFullscreen(element: HTMLElement | null): Promise<boolean> {
  if (!element || !fullscreenSupported()) return false;
  if (document.fullscreenElement) return true;
  try {
    await element.requestFullscreen({ navigationUI: "hide" });
    return true;
  } catch {
    return false;
  }
}

export async function exitFullscreen(): Promise<void> {
  if (typeof document === "undefined" || !document.fullscreenElement) return;
  try {
    await document.exitFullscreen();
  } catch {
    // Already left, or the browser refused; nothing else to do.
  }
}

export function useExamLock({
  active,
  onIncident,
}: {
  active: boolean;
  onIncident: (type: MockIncidentType) => void;
}) {
  const [warning, setWarning] = useState<MockIncidentType | null>(null);
  const report = useRef(onIncident);
  report.current = onIncident;
  // Fullscreen exit and visibility events can repeat within a moment.
  const lastLogged = useRef<{ type: MockIncidentType; at: number } | null>(null);

  const log = useCallback((type: MockIncidentType) => {
    const now = Date.now();
    const previous = lastLogged.current;
    if (previous && previous.type === type && now - previous.at < 1500) return;
    lastLogged.current = { type, at: now };
    report.current(type);
    if (type !== "page-hide") setWarning(type);
  }, []);

  useEffect(() => {
    if (!active) return;
    const onFullscreenChange = () => {
      if (fullscreenSupported() && !document.fullscreenElement) log("fullscreen-exit");
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") log("tab-hidden");
    };
    // A tab switch fires blur first, then visibilitychange; wait briefly so
    // it is logged once as a tab switch rather than twice.
    let blurTimer: number | undefined;
    const onBlur = () => {
      window.clearTimeout(blurTimer);
      blurTimer = window.setTimeout(() => {
        if (document.visibilityState !== "hidden" && !document.hasFocus()) log("window-blur");
      }, 400);
    };
    const onPageHide = () => log("page-hide");
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      // Shows the browser's own "leave site?" prompt; the attempt stays consumed.
      event.preventDefault();
    };
    document.addEventListener("fullscreenchange", onFullscreenChange);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("blur", onBlur);
    window.addEventListener("pagehide", onPageHide);
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      window.clearTimeout(blurTimer);
      document.removeEventListener("fullscreenchange", onFullscreenChange);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("pagehide", onPageHide);
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
  }, [active, log]);

  const returnToExam = useCallback(async () => {
    setWarning(null);
    // The whole document goes full screen; the exam layer covers the app.
    await enterFullscreen(document.documentElement);
  }, []);

  return { warning, returnToExam, dismissWarning: () => setWarning(null) };
}
