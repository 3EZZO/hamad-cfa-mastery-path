import { describe, expect, it } from "vitest";
import {
  boundedOutputScale, effectiveZoom, findMatches, fitZoom, MAX_CANVAS_PIXELS, nextZoomStep,
  PDF_TO_CSS, readerKeyAction,
} from "./readerModel";

const LETTER = { width: 612, height: 792 };
const A4 = { width: 595, height: 842 };

describe("reader geometry", () => {
  it("fits width and page using each page's intrinsic size", () => {
    const laptop = { width: 1000, height: 640 };
    expect(fitZoom("width", laptop, LETTER)).toBeCloseTo((1000 - 48) / (612 * PDF_TO_CSS), 2);
    const letterPage = fitZoom("page", laptop, LETTER);
    const a4Page = fitZoom("page", laptop, A4);
    expect(letterPage).toBeCloseTo((640 - 48) / (792 * PDF_TO_CSS), 2);
    // Reading 8's taller A4 page fits smaller than Letter in the same space.
    expect(a4Page).toBeLessThan(letterPage);
    // A short laptop viewport can fit a whole A4 page below 50%.
    expect(fitZoom("page", { width: 860, height: 450 }, A4)).toBeLessThan(0.5);
  });

  it("uses the manual zoom only in custom mode", () => {
    expect(effectiveZoom("custom", 1.5, { width: 800, height: 600 }, LETTER)).toBe(1.5);
    expect(effectiveZoom("width", 1.5, null, LETTER)).toBe(1.5);
    expect(effectiveZoom("width", 1.5, { width: 800, height: 600 }, LETTER)).not.toBe(1.5);
  });

  it("bounds canvas memory on HiDPI screens and large zooms", () => {
    expect(boundedOutputScale(800, 1000, 3)).toBe(2);
    expect(boundedOutputScale(800, 1000, 1)).toBe(1);
    const huge = boundedOutputScale(2448, 3168, 2);
    expect(2448 * 3168 * huge * huge).toBeLessThanOrEqual(MAX_CANVAS_PIXELS + 1);
  });

  it("steps through the zoom scale within bounds", () => {
    expect(nextZoomStep(1, 1)).toBe(1.1);
    expect(nextZoomStep(1, -1)).toBe(0.9);
    expect(nextZoomStep(3, 1)).toBe(3);
    expect(nextZoomStep(0.41, -1)).toBe(0.33);
    expect(nextZoomStep(0.41, 1)).toBe(0.5);
    expect(nextZoomStep(0.25, -1)).toBe(0.25);
  });
});

describe("in-document search", () => {
  it("finds every match in page order without changing the source", () => {
    const pages = ["Holding period return and time-weighted return", "Money-weighted RETURN", "none"];
    expect(findMatches(pages, "return")).toEqual([
      { page: 1, occurrence: 0 }, { page: 1, occurrence: 1 }, { page: 2, occurrence: 0 },
    ]);
    expect(findMatches(pages, "r")).toEqual([]);
    expect(findMatches(pages, "  time-weighted   return ")).toEqual([{ page: 1, occurrence: 0 }]);
  });
});

describe("reader keyboard", () => {
  const key = (value: string, extra: Partial<{ ctrlKey: boolean; metaKey: boolean; altKey: boolean; target: EventTarget | null }> = {}) =>
    readerKeyAction({ key: value, ctrlKey: false, metaKey: false, altKey: false, target: null, ...extra });

  it("turns pages and zooms only from reader focus, never while typing", () => {
    expect(key("ArrowRight")).toEqual({ kind: "page", delta: 1 });
    expect(key("PageUp")).toEqual({ kind: "page", delta: -1 });
    expect(key("Home")).toEqual({ kind: "first" });
    expect(key("+")).toEqual({ kind: "zoom", direction: 1 });
    expect(key("f", { ctrlKey: true })).toEqual({ kind: "search" });
    expect(key("ArrowRight", { target: { tagName: "TEXTAREA" } as unknown as EventTarget })).toBeNull();
    expect(key("ArrowRight", { target: { tagName: "INPUT" } as unknown as EventTarget })).toBeNull();
    expect(key("ArrowRight", { altKey: true })).toBeNull();
    expect(key("t")).toBeNull();
  });
});
