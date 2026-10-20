import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defaultTVMState } from "../../lib/calculator";
import { BA2Plus } from "./BA2Plus";
import { clampRect, clampWidth, defaultRect, PANEL_MAX_WIDTH, PANEL_MIN_WIDTH, readPanelRect, writePanelRect } from "./floatingPanelModel";

const viewport = { width: 1280, height: 800 };

describe("floating calculator geometry", () => {
  it("keeps the width within limits and the screen", () => {
    expect(clampWidth(100, viewport)).toBe(PANEL_MIN_WIDTH);
    expect(clampWidth(5000, viewport)).toBe(PANEL_MAX_WIDTH);
    expect(clampWidth(5000, { width: 500, height: 800 })).toBe(484);
    expect(clampWidth(Number.NaN, viewport)).toBe(380);
  });

  it("keeps the panel on screen and defaults to the bottom-right corner", () => {
    expect(clampRect({ x: -50, y: -50, width: 400 }, 500, viewport)).toEqual({ x: 8, y: 8, width: 400 });
    expect(clampRect({ x: 5000, y: 5000, width: 400 }, 500, viewport)).toEqual({ x: 872, y: 292, width: 400 });
    // Taller than the window: the title bar stays reachable.
    expect(clampRect({ x: 10, y: 400, width: 400 }, 2000, viewport).y).toBe(8);
    expect(defaultRect(viewport, 500)).toEqual({ x: 884, y: 284, width: 380 });
    // Too tall for the window: scaled so it fits below the toolbars.
    const fitted = defaultRect({ width: 1225, height: 614 }, 900, 44);
    expect(fitted.width).toBeLessThan(380);
    expect(fitted.y).toBeGreaterThanOrEqual(100);
    expect(fitted.x + fitted.width).toBe(1225 - 16);
  });

  it("remembers a rect per key and ignores broken storage", () => {
    const store: Record<string, string> = {};
    vi.stubGlobal("localStorage", { getItem: (key: string) => store[key] ?? null, setItem: (key: string, value: string) => { store[key] = value; } });
    writePanelRect("module-tests", { x: 10, y: 20, width: 300 });
    expect(readPanelRect("module-tests")).toEqual({ x: 10, y: 20, width: 300 });
    expect(readPanelRect("pdf-teaching")).toBeNull();
    store["hamad-floating-calculator:pdf-teaching"] = "{bad";
    expect(readPanelRect("pdf-teaching")).toBeNull();
    vi.unstubAllGlobals();
  });
});

describe("calculator keyboard scope", () => {
  let renderer: ReactTestRenderer | null = null;
  const listeners: Array<(event: KeyboardEvent) => void> = [];
  beforeEach(() => {
    listeners.length = 0;
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    vi.stubGlobal("window", {
      addEventListener: (type: string, listener: (event: KeyboardEvent) => void) => { if (type === "keydown") listeners.push(listener); },
      removeEventListener: vi.fn(),
    });
  });
  afterEach(() => {
    if (renderer) act(() => renderer?.unmount());
    renderer = null;
    vi.unstubAllGlobals();
  });

  it("takes keystrokes only from inside its scope when one is given", () => {
    const inside = { matches: () => false } as unknown as HTMLElement;
    const outside = { matches: () => false } as unknown as HTMLElement;
    const scope = { current: { contains: (node: unknown) => node === inside } as unknown as HTMLElement };
    act(() => { renderer = create(<BA2Plus onLog={() => {}} startTime={0} tvmState={defaultTVMState()} onStateChange={() => {}} keyScope={scope} />); });
    const display = () => renderer!.root.findByProps({ className: "ba2-digits" }).children.join("");
    const press = (target: HTMLElement) => act(() => listeners.at(-1)!({ key: "7", target, ctrlKey: false, metaKey: false, altKey: false, preventDefault() {} } as unknown as KeyboardEvent));
    press(outside);
    expect(display()).toBe("0.00");
    press(inside);
    expect(display()).not.toBe("0.00");
  });
});
