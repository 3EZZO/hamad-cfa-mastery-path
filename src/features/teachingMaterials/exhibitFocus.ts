import { MAX_READER_ZOOM } from "./materialTypes";
import { MIN_FIT_ZOOM, PDF_TO_CSS, READER_PADDING, type Size } from "./readerModel";

/**
 * Exhibit focus: a rectangle on the page, in fractions of the page (0–1),
 * that the reader zooms to while the rest of the page is dimmed. Nothing is
 * drawn on or saved into the PDF.
 */
export interface FocusRegion {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Smaller drags are treated as clicks, not exhibits. */
export const MIN_FOCUS_FRACTION = 0.03;

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
const round4 = (value: number) => Math.round(value * 10_000) / 10_000;

/** The rectangle between two drag points (fractions of the page), or null if too small. */
export function regionFromDrag(start: { x: number; y: number }, end: { x: number; y: number }): FocusRegion | null {
  const x1 = clamp01(Math.min(start.x, end.x));
  const y1 = clamp01(Math.min(start.y, end.y));
  const x2 = clamp01(Math.max(start.x, end.x));
  const y2 = clamp01(Math.max(start.y, end.y));
  if (x2 - x1 < MIN_FOCUS_FRACTION || y2 - y1 < MIN_FOCUS_FRACTION) return null;
  return { x: round4(x1), y: round4(y1), w: round4(x2 - x1), h: round4(y2 - y1) };
}

export function sanitizeRegion(value: unknown): FocusRegion | null {
  if (typeof value !== "object" || value === null) return null;
  const region = value as Record<string, unknown>;
  const numbers = [region.x, region.y, region.w, region.h];
  if (!numbers.every(item => typeof item === "number" && Number.isFinite(item))) return null;
  const [x, y, w, h] = numbers as number[];
  if (x! < 0 || y! < 0 || w! < MIN_FOCUS_FRACTION || h! < MIN_FOCUS_FRACTION || x! + w! > 1.0001 || y! + h! > 1.0001) return null;
  return { x: round4(x!), y: round4(y!), w: round4(w!), h: round4(h!) };
}

/** Display zoom at which the region fills the visible reader area. */
export function focusZoom(region: FocusRegion, container: Size, page: Size): number {
  const width = Math.max(1, container.width - READER_PADDING * 2);
  const height = Math.max(1, container.height - READER_PADDING * 2);
  const byWidth = width / (region.w * page.width * PDF_TO_CSS);
  const byHeight = height / (region.h * page.height * PDF_TO_CSS);
  const value = Math.min(byWidth, byHeight);
  return Math.round(Math.min(MAX_READER_ZOOM, Math.max(MIN_FIT_ZOOM, value)) * 100) / 100;
}

/** Scroll offsets that centre the region in the viewport. */
export function focusScroll(region: FocusRegion, box: { left: number; top: number; width: number; height: number }, viewport: Size) {
  const centreX = box.left + (region.x + region.w / 2) * box.width;
  const centreY = box.top + (region.y + region.h / 2) * box.height;
  return { left: Math.max(0, Math.round(centreX - viewport.width / 2)), top: Math.max(0, Math.round(centreY - viewport.height / 2)) };
}
