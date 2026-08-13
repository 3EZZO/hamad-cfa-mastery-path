export interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{
    outcome: "accepted" | "dismissed";
    platform: string;
  }>;
  prompt(): Promise<void>;
}

export function isIosDevice(userAgent: string): boolean {
  return /iphone|ipad|ipod/i.test(userAgent);
}

export function isStandaloneDisplay(
  matchMedia: Pick<MediaQueryList, "matches"> | undefined,
  navigatorStandalone: boolean | undefined,
): boolean {
  return Boolean(matchMedia?.matches || navigatorStandalone);
}

export function shouldShowIosInstallGuide(
  iosDevice: boolean,
  installed: boolean,
  deferredPromptAvailable: boolean,
): boolean {
  return iosDevice && !installed && !deferredPromptAvailable;
}

export async function registerProject202ServiceWorker(
  serviceWorker: Pick<ServiceWorkerContainer, "register"> | undefined =
    typeof navigator === "undefined" ? undefined : navigator.serviceWorker,
  baseUrl = import.meta.env.BASE_URL,
): Promise<ServiceWorkerRegistration | null> {
  if (!serviceWorker || (typeof window !== "undefined" && !window.isSecureContext)) {
    return null;
  }
  return serviceWorker.register(`${baseUrl}service-worker.js`, {
    scope: baseUrl,
    updateViaCache: "none",
  });
}
