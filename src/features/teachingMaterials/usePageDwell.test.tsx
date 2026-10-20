import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { usePageDwell } from "./usePageDwell";

const taught = vi.fn();
const seconds = vi.fn();
let tree: ReactTestRenderer | undefined;
let hidden = false;
let visibilityListener: (() => void) | null = null;

function Harness({ page, counting }: { page: number | null; counting: boolean }) {
  usePageDwell({ versionId: "v1", page, counting, onPageTaught: taught, onSeconds: seconds });
  return null;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  hidden = false;
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("window", { setInterval, clearInterval, setTimeout, clearTimeout });
  vi.stubGlobal("document", {
    get hidden() { return hidden; },
    addEventListener: (_: string, listener: () => void) => { visibilityListener = listener; },
    removeEventListener: vi.fn(),
  });
});
afterEach(async () => {
  if (tree) await act(async () => tree!.unmount());
  tree = undefined;
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const advance = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });
const total = () => seconds.mock.calls.reduce((sum, call) => sum + (call[1] as number), 0);

describe("page dwell", () => {
  it("marks a page after 20 seconds on screen and batches teaching time", async () => {
    await act(async () => { tree = create(<Harness page={4} counting />); });
    await advance(19_000);
    expect(taught).not.toHaveBeenCalled();
    await advance(2_000);
    expect(taught).toHaveBeenCalledExactlyOnceWith("v1", 4);
    await advance(40_000);
    expect(taught).toHaveBeenCalledTimes(1);
    await act(async () => tree!.update(<Harness page={4} counting={false} />));
    expect(total()).toBeCloseTo(61, 0);
  });

  it("restarts the dwell when the page changes", async () => {
    await act(async () => { tree = create(<Harness page={1} counting />); });
    await advance(15_000);
    await act(async () => tree!.update(<Harness page={2} counting />));
    await advance(15_000);
    expect(taught).not.toHaveBeenCalled();
    await advance(6_000);
    expect(taught).toHaveBeenCalledExactlyOnceWith("v1", 2);
  });

  it("counts nothing while paused or while the tab is hidden", async () => {
    await act(async () => { tree = create(<Harness page={1} counting={false} />); });
    await advance(60_000);
    expect(taught).not.toHaveBeenCalled();
    expect(seconds).not.toHaveBeenCalled();
    await act(async () => tree!.update(<Harness page={1} counting />));
    hidden = true;
    await act(async () => visibilityListener?.());
    await advance(60_000);
    expect(taught).not.toHaveBeenCalled();
  });
});
