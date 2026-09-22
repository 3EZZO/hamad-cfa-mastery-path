import { describe, expect, it, vi } from "vitest";
import {
  loadMockScoreChart,
  loadPaymentsHub,
  loadPracticeBankAdmin,
  loadPracticeCoach,
  loadReceiptVerificationScreen,
  loadTutorSessionWorkspace,
  warmUpPracticeView,
} from "./lazyViews";

describe("lazy view entry points", () => {
  it("resolve every split view to a renderable default export", async () => {
    const loaders = {
      loadPracticeCoach,
      loadPracticeBankAdmin,
      loadPaymentsHub,
      loadReceiptVerificationScreen,
      loadMockScoreChart,
      loadTutorSessionWorkspace,
    };
    for (const [name, load] of Object.entries(loaders)) {
      const module = await load();
      expect(typeof module.default, name).toBe("function");
    }
  }, 60_000);

  it("warms the practice chunk during idle time when the browser offers it", () => {
    const requestIdleCallback = vi.fn();
    const setTimeout = vi.fn();
    const load = vi.fn(() => Promise.resolve());
    warmUpPracticeView({ requestIdleCallback, setTimeout } as never, load);
    expect(requestIdleCallback).toHaveBeenCalledTimes(1);
    expect(setTimeout).not.toHaveBeenCalled();
    expect(load).not.toHaveBeenCalled();
    (requestIdleCallback.mock.calls[0][0] as () => void)();
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("falls back to a short timer and swallows load failures", async () => {
    const setTimeout = vi.fn();
    const load = vi.fn(() => Promise.reject(new Error("offline")));
    warmUpPracticeView({ setTimeout } as never, load);
    expect(setTimeout).toHaveBeenCalledWith(expect.any(Function), 1500);
    (setTimeout.mock.calls[0][0] as () => void)();
    expect(load).toHaveBeenCalledTimes(1);
    await Promise.resolve();
    await Promise.resolve();
  });
});
