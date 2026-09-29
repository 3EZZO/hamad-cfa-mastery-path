import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEPTH_STORAGE_KEY, depthMode, readDepthPreference, setDepthPreference } from "./depthMotion";

let stored: Record<string, string>;
let reduced: boolean;
let root: { dataset: Record<string, string> };

beforeEach(() => {
  stored = {}; reduced = false; root = { dataset: {} };
  vi.stubGlobal("localStorage", { getItem: (key: string) => stored[key] ?? null, setItem: (key: string, value: string) => { stored[key] = value; } });
  vi.stubGlobal("window", { matchMedia: (query: string) => ({ matches: query.includes("reduce") && reduced }) });
  vi.stubGlobal("navigator", { hardwareConcurrency: 8, deviceMemory: 8 });
  vi.stubGlobal("document", { documentElement: root });
});
afterEach(() => { vi.unstubAllGlobals(); });

describe("3D effects preference", () => {
  it("is on by default and stored per device", () => {
    expect(readDepthPreference()).toBe("on");
    expect(depthMode()).toBe("depth");
    setDepthPreference("off");
    expect(stored).toEqual({ [DEPTH_STORAGE_KEY]: "off" });
    expect(root.dataset.motion).toBe("flat");
    setDepthPreference("on");
    expect(root.dataset.motion).toBe("depth");
  });

  it("falls back to flat for reduced motion and low-power devices", () => {
    reduced = true;
    expect(depthMode("on")).toBe("flat");
    reduced = false;
    vi.stubGlobal("navigator", { hardwareConcurrency: 4, deviceMemory: 8 });
    expect(depthMode("on")).toBe("depth");
    vi.stubGlobal("navigator", { hardwareConcurrency: 2 });
    expect(depthMode("on")).toBe("flat");
    vi.stubGlobal("navigator", { hardwareConcurrency: 8, deviceMemory: 2 });
    expect(depthMode("on")).toBe("flat");
  });

  it("works when storage is blocked", () => {
    vi.stubGlobal("localStorage", { getItem: () => { throw Error("blocked"); }, setItem: () => { throw Error("blocked"); } });
    expect(readDepthPreference()).toBe("on");
    expect(() => setDepthPreference("off")).not.toThrow();
    expect(root.dataset.motion).toBe("flat");
  });
});
