import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import {
  applyUpdate,
  isIosDevice,
  isStandaloneDisplay,
  registerProject202ServiceWorker,
  shouldShowIosInstallGuide,
  watchForUpdate,
  type ContainerLike,
  type RegistrationLike,
} from "./pwa";

// Fake registration/container: the update state machine, not a browser.
function fakeWorker(state = "installing") {
  const listeners: Array<() => void> = [];
  return {
    state,
    postMessage: vi.fn(),
    addEventListener: (_type: "statechange", listener: () => void) => { listeners.push(listener); },
    setState(next: string) { this.state = next; listeners.forEach(listener => listener()); },
  };
}
function fakeRegistration(waiting: ReturnType<typeof fakeWorker> | null = null) {
  const listeners: Array<() => void> = [];
  return {
    waiting,
    installing: null as ReturnType<typeof fakeWorker> | null,
    addEventListener: (_type: "updatefound", listener: () => void) => { listeners.push(listener); },
    updateFound(worker: ReturnType<typeof fakeWorker>) { this.installing = worker; listeners.forEach(listener => listener()); },
  };
}
function fakeContainer(controller: unknown = {}) {
  const listeners = new Set<() => void>();
  return {
    controller,
    addEventListener: (_type: "controllerchange", listener: () => void) => { listeners.add(listener); },
    removeEventListener: (_type: "controllerchange", listener: () => void) => { listeners.delete(listener); },
    controllerChange() { [...listeners].forEach(listener => listener()); },
    size: () => listeners.size,
  };
}

describe("Hamad CFA Mastery PWA helpers", () => {
  it("recognizes iPhone and iPad user agents", () => {
    expect(isIosDevice("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)"))
      .toBe(true);
    expect(isIosDevice("Mozilla/5.0 (Linux; Android 15)"))
      .toBe(false);
  });

  it("detects standalone mode from standards and iOS signals", () => {
    expect(isStandaloneDisplay({ matches: true }, false)).toBe(true);
    expect(isStandaloneDisplay({ matches: false }, true)).toBe(true);
    expect(isStandaloneDisplay({ matches: false }, false)).toBe(false);
  });

  it("shows iOS guidance only when a native install prompt is unavailable", () => {
    expect(shouldShowIosInstallGuide(true, false, false)).toBe(true);
    expect(shouldShowIosInstallGuide(true, true, false)).toBe(false);
    expect(shouldShowIosInstallGuide(false, false, false)).toBe(false);
    expect(shouldShowIosInstallGuide(true, false, true)).toBe(false);
  });

  it("reports a worker that is already waiting, and later installs, only when a controller exists", () => {
    const onWaiting = vi.fn();
    const waiting = fakeWorker("installed");
    const registration = fakeRegistration(waiting);
    watchForUpdate(registration as RegistrationLike, fakeContainer() as ContainerLike, onWaiting);
    expect(onWaiting).toHaveBeenCalledWith(waiting);

    const later = fakeWorker();
    registration.updateFound(later);
    later.setState("installed");
    expect(onWaiting).toHaveBeenCalledTimes(2);
    expect(onWaiting).toHaveBeenLastCalledWith(later);

    // First-ever install: nothing controls the page yet, so it is not an update.
    const fresh = fakeRegistration();
    const firstInstall = vi.fn();
    watchForUpdate(fresh as RegistrationLike, fakeContainer(null) as ContainerLike, firstInstall);
    const worker = fakeWorker();
    fresh.updateFound(worker);
    worker.setState("installed");
    expect(firstInstall).not.toHaveBeenCalled();
  });

  it("asks the waiting worker to take over and reloads exactly once", () => {
    const worker = fakeWorker("installed");
    const container = fakeContainer();
    const reload = vi.fn();
    applyUpdate(worker, container as ContainerLike, reload);
    expect(worker.postMessage).toHaveBeenCalledWith({ type: "SKIP_WAITING" });
    expect(reload).not.toHaveBeenCalled();
    container.controllerChange();
    container.controllerChange();
    expect(reload).toHaveBeenCalledTimes(1);
    expect(container.size()).toBe(0);
  });

  it("ships a worker that waits for the page instead of taking over on install", () => {
    const source = readFileSync(new URL("../../public/service-worker.js", import.meta.url), "utf8");
    const install = source.slice(source.indexOf('addEventListener("install"'), source.indexOf('addEventListener("message"'));
    expect(install.length).toBeGreaterThan(0);
    expect(install).not.toContain("skipWaiting");
    expect(source).toMatch(/addEventListener\("message", \(event\) => \{\s*if \(event\.data && event\.data\.type === "SKIP_WAITING"\) self\.skipWaiting\(\);/);
    expect(source).toContain("self.clients.claim()");
  });

  it("registers the service worker inside the supplied base path", async () => {
    const registration = {} as ServiceWorkerRegistration;
    const register = vi.fn(async () => registration);

    const result = await registerProject202ServiceWorker(
      { register },
      "/hamad-cfa-mastery-path/",
    );

    expect(result).toBe(registration);
    expect(register).toHaveBeenCalledWith(
      "/hamad-cfa-mastery-path/service-worker.js",
      { scope: "/hamad-cfa-mastery-path/", updateViaCache: "none" },
    );
  });
});
