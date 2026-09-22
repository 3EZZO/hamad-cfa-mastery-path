import { describe, expect, it, vi } from "vitest";
import {
  ERROR_LOG_KEY,
  ERROR_LOG_LIMIT,
  clearErrorLog,
  describeError,
  installGlobalErrorCapture,
  readErrorLog,
  recordError,
} from "./errorReport";

function memoryStore(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    removeItem: (key: string) => void data.delete(key),
    data,
  };
}

describe("errorReport", () => {
  it("describes errors, strings and unknown values without throwing", () => {
    expect(describeError(new TypeError("boom"))).toMatchObject({ message: "boom" });
    expect(describeError(new TypeError("boom")).stack).toContain("TypeError");
    expect(describeError("plain")).toEqual({ message: "plain" });
    expect(describeError({ code: 7 })).toEqual({ message: '{"code":7}' });
    expect(describeError(undefined)).toEqual({ message: "undefined" });
  });

  it("keeps the newest entries first and caps the log", () => {
    const store = memoryStore();
    for (let index = 0; index < ERROR_LOG_LIMIT + 5; index += 1) {
      recordError({ source: "render", scope: `view:${index}`, message: `error ${index}` }, store);
    }
    const log = readErrorLog(store);
    expect(log).toHaveLength(ERROR_LOG_LIMIT);
    expect(log[0].message).toBe(`error ${ERROR_LOG_LIMIT + 4}`);
    expect(log[ERROR_LOG_LIMIT - 1].message).toBe("error 5");
  });

  it("trims long stacks and stores only message, stack, scope and source", () => {
    const store = memoryStore();
    const stack = "x".repeat(5_000);
    const record = recordError({ source: "window", scope: "window", message: "m", stack }, store);
    expect(record.stack?.length).toBeLessThan(2_100);
    const [stored] = readErrorLog(store);
    expect(Object.keys(stored).sort()).toEqual(["at", "message", "scope", "source", "stack"]);
  });

  it("tolerates corrupt or blocked storage", () => {
    expect(readErrorLog(memoryStore({ [ERROR_LOG_KEY]: "{not json" }))).toEqual([]);
    expect(readErrorLog(memoryStore({ [ERROR_LOG_KEY]: '[1, {"at": "x"}]' }))).toEqual([]);
    const blocked = {
      getItem: () => { throw new Error("blocked"); },
      setItem: () => { throw new Error("blocked"); },
      removeItem: () => { throw new Error("blocked"); },
    };
    expect(() => recordError({ source: "render", scope: "s", message: "m" }, blocked)).not.toThrow();
    expect(() => clearErrorLog(blocked)).not.toThrow();
    expect(readErrorLog(null)).toEqual([]);
    expect(recordError({ source: "render", scope: "s", message: "m" }, null).message).toBe("m");
  });

  it("clears the log", () => {
    const store = memoryStore();
    recordError({ source: "render", scope: "s", message: "m" }, store);
    clearErrorLog(store);
    expect(readErrorLog(store)).toEqual([]);
  });

  it("records uncaught errors and unhandled rejections until disposed", () => {
    const store = memoryStore();
    const listeners = new Map<string, (event: Event) => void>();
    const target = {
      addEventListener: vi.fn((type: string, listener: (event: Event) => void) => void listeners.set(type, listener)),
      removeEventListener: vi.fn((type: string) => void listeners.delete(type)),
    };
    const dispose = installGlobalErrorCapture(target as never, store);
    expect([...listeners.keys()].sort()).toEqual(["error", "unhandledrejection"]);

    listeners.get("error")!({ message: "script failed", error: new Error("script failed") } as unknown as Event);
    listeners.get("unhandledrejection")!({ reason: "sync rejected" } as unknown as Event);
    const log = readErrorLog(store);
    expect(log.map((entry) => [entry.source, entry.message])).toEqual([
      ["promise", "sync rejected"],
      ["window", "script failed"],
    ]);

    dispose();
    expect(listeners.size).toBe(0);
    expect(installGlobalErrorCapture(undefined, store)).toBeTypeOf("function");
  });
});
