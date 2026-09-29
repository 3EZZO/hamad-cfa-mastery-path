/* CSS-only 3D effects: this module only decides whether they run and feeds
   the pointer position to tilting cards. `data-motion="depth" | "flat"` on
   <html> gates every effect in identity.css. */

export const DEPTH_STORAGE_KEY = "hamad-depth-effects";
export type DepthPreference = "on" | "off";

const TILT_TARGETS = ".metric-card, .mock-card";
/** Stages whose background light drifts with the pointer (parallax). */
const PARALLAX_STAGES = ".today-hero, .access-shell";

export function readDepthPreference(): DepthPreference {
  try { return localStorage.getItem(DEPTH_STORAGE_KEY) === "off" ? "off" : "on"; }
  catch { return "on"; }
}

function matches(query: string) {
  return typeof window.matchMedia === "function" && window.matchMedia(query).matches;
}

/** Very few cores or little memory: keep the calm 2D version. A 4-core,
    8 GB laptop is ordinary hardware and keeps the depth effects. */
function lowPower() {
  const nav = navigator as Navigator & { deviceMemory?: number };
  return (nav.hardwareConcurrency ?? 8) <= 2 || (nav.deviceMemory ?? 8) <= 2;
}

export function depthMode(preference = readDepthPreference()): "depth" | "flat" {
  if (preference === "off" || matches("(prefers-reduced-motion: reduce)") || lowPower()) return "flat";
  return "depth";
}

export function applyDepthMode() {
  document.documentElement.dataset.motion = depthMode();
}

export function setDepthPreference(preference: DepthPreference) {
  // A device preference only: never written to tracker or session data.
  try { localStorage.setItem(DEPTH_STORAGE_KEY, preference); } catch { /* Keep working in memory. */ }
  document.documentElement.dataset.motion = depthMode(preference);
}

function resetTilt(element: HTMLElement) {
  element.style.removeProperty("--tilt-x");
  element.style.removeProperty("--tilt-y");
  element.style.removeProperty("--sheen-x");
}

export function installDepthMotion() {
  applyDepthMode();
  window.matchMedia?.("(prefers-reduced-motion: reduce)").addEventListener?.("change", applyDepthMode);
  window.addEventListener("storage", event => {
    if (event.key === DEPTH_STORAGE_KEY || event.key === null) applyDepthMode();
  });
  // Tilt follows a mouse or trackpad only; touch screens keep cards still.
  if (!matches("(hover: hover) and (pointer: fine)")) return;
  let active: HTMLElement | null = null;
  let last: PointerEvent | null = null;
  let frame = 0;
  const update = () => {
    frame = 0;
    const event = last;
    const target = event && !event.buttons && document.documentElement.dataset.motion === "depth"
      ? (event.target as Element | null)?.closest?.<HTMLElement>(TILT_TARGETS) ?? null
      : null;
    const stage = event && document.documentElement.dataset.motion === "depth"
      ? (event.target as Element | null)?.closest?.<HTMLElement>(PARALLAX_STAGES) ?? null
      : null;
    if (stage && event) {
      stage.style.setProperty("--px", ((event.clientX / window.innerWidth) * 2 - 1).toFixed(3));
      stage.style.setProperty("--py", ((event.clientY / window.innerHeight) * 2 - 1).toFixed(3));
    }
    if (active && active !== target) resetTilt(active);
    active = target;
    if (!target || !event) return;
    const box = target.getBoundingClientRect();
    const x = Math.min(1, Math.max(0, (event.clientX - box.left) / box.width));
    const y = Math.min(1, Math.max(0, (event.clientY - box.top) / box.height));
    target.style.setProperty("--tilt-x", ((0.5 - y) * 2).toFixed(3));
    target.style.setProperty("--tilt-y", ((x - 0.5) * 2).toFixed(3));
    target.style.setProperty("--sheen-x", `${(x * 100).toFixed(1)}%`);
  };
  const schedule = (event: PointerEvent) => {
    last = event;
    if (!frame) frame = requestAnimationFrame(update);
  };
  document.addEventListener("pointermove", schedule, { passive: true });
  document.documentElement.addEventListener("pointerleave", () => {
    last = null;
    if (active) resetTilt(active);
    active = null;
  });
}
