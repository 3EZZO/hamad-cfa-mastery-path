import { describe, expect, it, vi } from "vitest";
import {
  isIosDevice,
  isStandaloneDisplay,
  registerProject202ServiceWorker,
  shouldShowIosInstallGuide,
} from "./pwa";

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

  it("registers the service worker inside the supplied base path", async () => {
    const registration = {} as ServiceWorkerRegistration;
    const register = vi.fn(async () => registration);

    const result = await registerProject202ServiceWorker(
      { register },
      "/hamad-cfa-project-202/",
    );

    expect(result).toBe(registration);
    expect(register).toHaveBeenCalledWith(
      "/hamad-cfa-project-202/service-worker.js",
      { scope: "/hamad-cfa-project-202/", updateViaCache: "none" },
    );
  });
});
