/**
 * Geometry for the floating calculator: where it sits and how wide it is.
 * Height follows the width because the calculator scales as a whole.
 */
export interface PanelRect {
  x: number;
  y: number;
  width: number;
}

export interface Viewport {
  width: number;
  height: number;
}

export const PANEL_BASE_WIDTH = 380;
export const PANEL_MIN_WIDTH = 200;
export const PANEL_MAX_WIDTH = 720;
export const PANEL_MARGIN = 8;
const STORAGE_PREFIX = "hamad-floating-calculator:";

export function clampWidth(width: number, viewport: Viewport): number {
  const max = Math.max(PANEL_MIN_WIDTH, Math.min(PANEL_MAX_WIDTH, viewport.width - PANEL_MARGIN * 2));
  return Math.round(Math.min(max, Math.max(PANEL_MIN_WIDTH, Number.isFinite(width) ? width : PANEL_BASE_WIDTH)));
}

/** Keeps the whole panel (or at least its title bar) on screen. */
export function clampRect(rect: PanelRect, panelHeight: number, viewport: Viewport): PanelRect {
  const width = clampWidth(rect.width, viewport);
  const maxX = Math.max(PANEL_MARGIN, viewport.width - width - PANEL_MARGIN);
  const maxY = Math.max(PANEL_MARGIN, viewport.height - Math.min(panelHeight, viewport.height - PANEL_MARGIN * 2) - PANEL_MARGIN);
  return {
    width,
    x: Math.round(Math.min(maxX, Math.max(PANEL_MARGIN, Number.isFinite(rect.x) ? rect.x : maxX))),
    y: Math.round(Math.min(maxY, Math.max(PANEL_MARGIN, Number.isFinite(rect.y) ? rect.y : maxY))),
  };
}

/** Space kept clear at the top for headers and toolbars on first placement. */
export const PANEL_TOP_CLEARANCE = 112;

/**
 * First placement: the bottom-right corner, scaled down when needed so the
 * whole calculator fits below the page's headers and toolbars.
 * `heightAtBase` is the panel height at the base width; `barHeight` does not scale.
 */
export function defaultRect(viewport: Viewport, heightAtBase: number, barHeight = 0): PanelRect {
  const room = viewport.height - PANEL_TOP_CLEARANCE - 16;
  const body = Math.max(1, heightAtBase - barHeight);
  const fitted = heightAtBase > room ? PANEL_BASE_WIDTH * Math.max(0, room - barHeight) / body : PANEL_BASE_WIDTH;
  const width = clampWidth(Math.min(PANEL_BASE_WIDTH, fitted), viewport);
  const height = barHeight + body * (width / PANEL_BASE_WIDTH);
  return clampRect({ width, x: viewport.width - width - 16, y: viewport.height - height - 16 }, height, viewport);
}

export function readPanelRect(key: string): PanelRect | null {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(STORAGE_PREFIX + key) ?? "null");
    if (!value || typeof value !== "object") return null;
    const { x, y, width } = value as Record<string, unknown>;
    return [x, y, width].every(item => typeof item === "number" && Number.isFinite(item)) ? { x: x as number, y: y as number, width: width as number } : null;
  } catch {
    return null;
  }
}

export function writePanelRect(key: string, rect: PanelRect): void {
  try {
    localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(rect));
  } catch {
    /* Remembering the position is a per-device convenience only. */
  }
}
