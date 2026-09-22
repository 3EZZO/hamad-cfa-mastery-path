import { describe, expect, it, vi } from "vitest";
import {
  loadMockScoreChart,
  loadPaymentsHub,
  loadPracticeBankAdmin,
  loadPracticeCoach,
  loadReceiptVerificationScreen,
  loadTutorSessionWorkspace,
  warmUpPracticeView,
  warmUpViews,
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

  it("loads several chunks one after another and keeps going past a failure", async () => {
    const order: string[] = [];
    let releaseFirst!: () => void;
    const first = vi.fn(() => new Promise<void>(resolve => { releaseFirst = () => { order.push("first"); resolve(); }; }));
    const failing = vi.fn(() => { order.push("failing"); return Promise.reject(new Error("offline")); });
    const last = vi.fn(() => { order.push("last"); return Promise.resolve(); });
    const setTimeout = vi.fn();
    warmUpViews([first, failing, last], { setTimeout } as never);
    (setTimeout.mock.calls[0][0] as () => void)();
    expect(first).toHaveBeenCalledTimes(1);
    expect(failing).not.toHaveBeenCalled();
    releaseFirst();
    for (let i = 0; i < 6; i += 1) await Promise.resolve();
    expect(order).toEqual(["first", "failing", "last"]);
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
