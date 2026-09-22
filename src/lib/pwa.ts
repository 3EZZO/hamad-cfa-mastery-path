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

type WorkerLike = Pick<ServiceWorker, "state" | "postMessage"> & {
  addEventListener(type: "statechange", listener: () => void): void;
};

export type RegistrationLike = {
  waiting: WorkerLike | null;
  installing: WorkerLike | null;
  addEventListener(type: "updatefound", listener: () => void): void;
};

export type ContainerLike = {
  controller: unknown;
  addEventListener(type: "controllerchange", listener: () => void): void;
  removeEventListener(type: "controllerchange", listener: () => void): void;
};

/**
 * Reports a new version of the app that has finished installing and is
 * waiting to take over. Fires at once when a worker is already waiting, and
 * again whenever a later update installs. A worker installed on a page that
 * had no controller is the first install, not an update, and is skipped.
 */
export function watchForUpdate(
  registration: RegistrationLike,
  container: ContainerLike,
  onWaiting: (worker: WorkerLike) => void,
): void {
  if (registration.waiting && container.controller) onWaiting(registration.waiting);
  registration.addEventListener("updatefound", () => {
    const installing = registration.installing;
    if (!installing) return;
    installing.addEventListener("statechange", () => {
      if (installing.state === "installed" && container.controller) onWaiting(installing);
    });
  });
}

/**
 * Tells the waiting worker to take over and reloads once it has. The guard
 * makes a double controllerchange (or two clicks) reload only once.
 */
export function applyUpdate(
  worker: Pick<ServiceWorker, "postMessage">,
  container: ContainerLike,
  reload: () => void,
): void {
  let refreshing = false;
  const onControllerChange = () => {
    if (refreshing) return;
    refreshing = true;
    container.removeEventListener("controllerchange", onControllerChange);
    reload();
  };
  container.addEventListener("controllerchange", onControllerChange);
  worker.postMessage({ type: "SKIP_WAITING" });
}
