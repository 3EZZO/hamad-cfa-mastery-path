import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Cloud not configured: the hook runs locally and starts no listeners.
vi.mock("../lib/cloud", () => ({
  getCloudConfigurationStatus: () => ({ configured: false, missingKeys: ["VITE_FIREBASE_API_KEY"], missingOptionalKeys: [] }),
}));
vi.mock("../lib/storage", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/storage")>();
  return { ...actual, loadPendingSync: vi.fn(() => null), loadState: vi.fn(actual.createDefaultState) };
});

import { loadPendingSync, loadState } from "../lib/storage";
import { useTrackerSync } from "./useTrackerSync";

function Probe({ tick }: { tick: number }) {
  useTrackerSync();
  return <span>{tick}</span>;
}

let tree: ReactTestRenderer | undefined;

describe("useTrackerSync", () => {
  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    vi.stubGlobal("window", {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      setTimeout: (callback: () => void, ms: number) => setTimeout(callback, ms),
      clearTimeout: (id: ReturnType<typeof setTimeout>) => clearTimeout(id),
    });
    vi.mocked(loadPendingSync).mockClear();
    vi.mocked(loadState).mockClear();
  });
  afterEach(async () => {
    if (tree) await act(async () => tree!.unmount());
    tree = undefined;
    vi.unstubAllGlobals();
  });

  it("reads the stored tracker and the queued change once, not on every render", async () => {
    await act(async () => { tree = create(<Probe tick={0} />); });
    for (let tick = 1; tick <= 3; tick += 1) {
      await act(async () => tree!.update(<Probe tick={tick} />));
    }
    expect(loadPendingSync).toHaveBeenCalledTimes(1);
    expect(loadState).toHaveBeenCalledTimes(1);
  });
});
