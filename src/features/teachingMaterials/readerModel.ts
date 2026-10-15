import { MAX_READER_ZOOM, type FitMode } from "./materialTypes";

/**
 * Pure reader geometry and search helpers. Zoom is expressed as the
 * familiar "100% = actual size" factor; pdf.js scale 1 is one PDF point per
 * CSS pixel, so actual size is 96/72.
 */
export const PDF_TO_CSS = 96 / 72;
export const READER_PADDING = 24;
export const MAX_CANVAS_PIXELS = 12_000_000;
export const MAX_OUTPUT_RATIO = 2;
export const MIN_FIT_ZOOM = 0.2;
export const ZOOM_STEPS = [0.25, 0.33, 0.5, 0.67, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3];

export interface Size {
  width: number;
  height: number;
}

/** Display zoom that fits the page (in PDF points) inside the container. */
export function fitZoom(mode: Exclude<FitMode, "custom">, container: Size, page: Size): number {
  const width = Math.max(1, container.width - READER_PADDING * 2);
  const height = Math.max(1, container.height - READER_PADDING * 2);
  const byWidth = width / (page.width * PDF_TO_CSS);
  const byPage = Math.min(byWidth, height / (page.height * PDF_TO_CSS));
  // Fitting may go below the manual minimum so a whole A4 page still fits a
  // short laptop viewport; saved preferences stay within the stored bounds.
  const value = mode === "width" ? byWidth : byPage;
  return Math.round(Math.min(MAX_READER_ZOOM, Math.max(MIN_FIT_ZOOM, value)) * 100) / 100;
}

export function effectiveZoom(fitMode: FitMode, zoom: number, container: Size | null, page: Size | null): number {
  if (fitMode === "custom" || !container || !page || container.width <= 0) return readerZoom(zoom);
  return fitZoom(fitMode, container, page);
}

/** pdf.js viewport scale for a display zoom. */
export function cssScale(zoom: number): number {
  const value = Number.isFinite(zoom) ? zoom : 1;
  return Math.min(MAX_READER_ZOOM, Math.max(MIN_FIT_ZOOM, value)) * PDF_TO_CSS;
}

/**
 * Device-pixel multiplier for the canvas: sharp on HiDPI screens but bounded
 * so a zoomed page never allocates an excessive canvas.
 */
export function boundedOutputScale(cssWidth: number, cssHeight: number, devicePixelRatio: number): number {
  const ratio = Math.min(MAX_OUTPUT_RATIO, Math.max(1, Number.isFinite(devicePixelRatio) ? devicePixelRatio : 1));
  const area = Math.max(1, cssWidth * cssHeight);
  const byMemory = Math.sqrt(MAX_CANVAS_PIXELS / area);
  return Math.max(0.5, Math.min(ratio, byMemory));
}

/** In-reader zoom bounds; stored preferences are clamped to 50–300%. */
export function readerZoom(zoom: number): number {
  const value = Number.isFinite(zoom) ? zoom : 1;
  return Math.round(Math.min(MAX_READER_ZOOM, Math.max(MIN_FIT_ZOOM, value)) * 100) / 100;
}

export function nextZoomStep(current: number, direction: 1 | -1): number {
  const value = readerZoom(current);
  if (direction > 0) return ZOOM_STEPS.find(step => step > value + 0.001) ?? MAX_READER_ZOOM;
  return [...ZOOM_STEPS].reverse().find(step => step < value - 0.001) ?? ZOOM_STEPS[0]!;
}

export function normalizeSearch(value: string): string {
  return value.replace(/\s+/g, " ").trim().toLocaleLowerCase();
}

export function countOccurrences(haystack: string, needle: string): number {
  if (!needle) return 0;
  let count = 0;
  let index = haystack.indexOf(needle);
  while (index !== -1) {
    count += 1;
    index = haystack.indexOf(needle, index + needle.length);
  }
  return count;
}

export interface SearchMatch {
  page: number;
  occurrence: number;
}

/** Every match in reading order; `pageTexts[0]` is page 1. */
export function findMatches(pageTexts: readonly string[], query: string): SearchMatch[] {
  const needle = normalizeSearch(query);
  if (needle.length < 2) return [];
  const matches: SearchMatch[] = [];
  pageTexts.forEach((text, index) => {
    const count = countOccurrences(normalizeSearch(text), needle);
    for (let occurrence = 0; occurrence < count; occurrence += 1) matches.push({ page: index + 1, occurrence });
  });
  return matches;
}

/** True when keyboard input belongs to a text field, not the reader. */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!target || typeof (target as HTMLElement).tagName !== "string") return false;
  const element = target as HTMLElement;
  const tag = element.tagName.toLowerCase();
  return tag === "input" || tag === "textarea" || tag === "select" || element.isContentEditable === true;
}

export type ReaderKeyAction =
  | { kind: "page"; delta: number }
  | { kind: "first" }
  | { kind: "last" }
  | { kind: "zoom"; direction: 1 | -1 }
  | { kind: "search" }
  | null;

export function readerKeyAction(event: { key: string; ctrlKey: boolean; metaKey: boolean; altKey: boolean; target: EventTarget | null }): ReaderKeyAction {
  if (event.altKey || isTypingTarget(event.target)) return null;
  const modified = event.ctrlKey || event.metaKey;
  if ((event.key === "f" || event.key === "F") && modified) return { kind: "search" };
  if (modified) return null;
  switch (event.key) {
    case "ArrowRight":
    case "PageDown":
      return { kind: "page", delta: 1 };
    case "ArrowLeft":
    case "PageUp":
      return { kind: "page", delta: -1 };
    case "Home":
      return { kind: "first" };
    case "End":
      return { kind: "last" };
    case "+":
    case "=":
      return { kind: "zoom", direction: 1 };
    case "-":
      return { kind: "zoom", direction: -1 };
    default:
      return null;
  }
}
