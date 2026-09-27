import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getNavLayout, NAV_LAYOUT_STORAGE_KEY, readNavLayout, resetNavLayoutForTests, setNavLayout } from "./navLayout";

describe("navigation layout preference", () => {
  let store: Record<string, string>;
  beforeEach(() => {
    store = {};
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => store[key] ?? null,
      setItem: (key: string, value: string) => { store[key] = value; },
    });
    resetNavLayoutForTests();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    resetNavLayoutForTests();
  });

  it("defaults to the new destinations", () => {
    expect(readNavLayout()).toBe("destinations");
    expect(getNavLayout()).toBe("destinations");
  });

  it("remembers classic on this device only", () => {
    setNavLayout("classic");
    expect(store[NAV_LAYOUT_STORAGE_KEY]).toBe("classic");
    resetNavLayoutForTests();
    expect(getNavLayout()).toBe("classic");
  });

  it("keeps working when storage throws", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => { throw new Error("blocked"); },
      setItem: () => { throw new Error("blocked"); },
    });
    resetNavLayoutForTests();
    expect(getNavLayout()).toBe("destinations");
    setNavLayout("classic");
    expect(getNavLayout()).toBe("classic");
  });
});
