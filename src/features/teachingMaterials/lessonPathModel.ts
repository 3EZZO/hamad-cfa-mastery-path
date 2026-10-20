import { sanitizeRegion, type FocusRegion } from "./exhibitFocus";

/**
 * A lesson path: an ordered list of stops (a PDF version and a page, with an
 * optional private prompt for the tutor) prepared for one session. It turns
 * any set of PDFs into a guided lesson without writing a playbook.
 */

export interface LessonStop {
  id: string;
  versionId: string;
  page: number;
  prompt: string;
  /** Optional exhibit to zoom to when the stop opens. */
  focus?: FocusRegion;
}

export const MAX_LESSON_STOPS = 40;
export const MAX_STOP_PROMPT_CHARS = 280;
const MAX_PAGE = 10_000;

export const EMPTY_LESSON_PATH: LessonStop[] = [];

function validPage(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= 1 && (value as number) <= MAX_PAGE;
}

export function sanitizeLessonPath(value: unknown): LessonStop[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  return value.flatMap(item => {
    const stop = item as Partial<LessonStop> | null;
    if (!stop || typeof stop.id !== "string" || !/^[a-z0-9-]{1,40}$/i.test(stop.id) || seen.has(stop.id)) return [];
    if (typeof stop.versionId !== "string" || !stop.versionId || stop.versionId.length > 200 || !validPage(stop.page)) return [];
    seen.add(stop.id);
    const focus = sanitizeRegion(stop.focus);
    return [{
      id: stop.id, versionId: stop.versionId, page: stop.page,
      prompt: typeof stop.prompt === "string" ? stop.prompt.slice(0, MAX_STOP_PROMPT_CHARS) : "",
      ...(focus ? { focus } : {}),
    }];
  }).slice(0, MAX_LESSON_STOPS);
}

export function newStopId(existing: readonly LessonStop[], now = Date.now()): string {
  let id = `s${now.toString(36)}`;
  for (let index = 1; existing.some(stop => stop.id === id); index += 1) id = `s${now.toString(36)}-${index}`;
  return id;
}

/** Adds a stop after `afterIndex` (or at the end). Null when the path is full. */
export function withStop(path: readonly LessonStop[], stop: Omit<LessonStop, "id">, afterIndex?: number, now?: number): LessonStop[] | null {
  if (path.length >= MAX_LESSON_STOPS) return null;
  const { focus, ...rest } = stop;
  const next: LessonStop = { ...rest, id: newStopId(path, now), prompt: stop.prompt.slice(0, MAX_STOP_PROMPT_CHARS), ...(focus ? { focus } : {}) };
  const at = afterIndex === undefined || afterIndex < 0 ? path.length : Math.min(path.length, afterIndex + 1);
  return [...path.slice(0, at), next, ...path.slice(at)];
}

export function withoutStop(path: readonly LessonStop[], id: string): LessonStop[] {
  return path.filter(stop => stop.id !== id);
}

export function movedStop(path: readonly LessonStop[], id: string, delta: -1 | 1): LessonStop[] {
  const index = path.findIndex(stop => stop.id === id);
  const target = index + delta;
  if (index < 0 || target < 0 || target >= path.length) return [...path];
  const next = [...path];
  [next[index], next[target]] = [next[target]!, next[index]!];
  return next;
}

export function withPrompt(path: readonly LessonStop[], id: string, prompt: string): LessonStop[] {
  return path.map(stop => (stop.id === id ? { ...stop, prompt: prompt.slice(0, MAX_STOP_PROMPT_CHARS) } : stop));
}

/** Appends another session's stops with fresh ids, up to the limit. */
export function withCopiedStops(path: readonly LessonStop[], source: readonly LessonStop[], now = Date.now()): LessonStop[] {
  let next = [...path];
  source.forEach((stop, index) => {
    const added = withStop(next, { versionId: stop.versionId, page: stop.page, prompt: stop.prompt, ...(stop.focus ? { focus: stop.focus } : {}) }, undefined, now + index);
    if (added) next = added;
  });
  return next;
}

/** The stop showing the given PDF page, if the current stop or any stop matches. */
export function stopIndexAt(path: readonly LessonStop[], versionId: string | null, page: number, current: number): number {
  const here = path[current];
  if (here && here.versionId === versionId && here.page === page) return current;
  return path.findIndex(stop => stop.versionId === versionId && stop.page === page);
}
