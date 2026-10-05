/**
 * Which Tutor Admin folds are open, remembered on this device. Fold ids are
 * `<section>:<name>` (e.g. `tests:results`); "Collapse all" on a section sets
 * that section's default and forgets its individual choices. Pure apart from
 * load/save, which never throw.
 */

export interface FoldMemory {
  /** The tutor's choice for one fold. */
  folds: Record<string, boolean>;
  /** A section-wide choice from Collapse all / Expand all. */
  sections: Record<string, boolean>;
}

export const EMPTY_FOLDS: FoldMemory = { folds: {}, sections: {} };

const sectionOf = (id: string) => id.split(":")[0]!;

export function isFoldOpen(memory: FoldMemory, id: string, defaultOpen = true): boolean {
  return memory.folds[id] ?? memory.sections[sectionOf(id)] ?? defaultOpen;
}

export function withFold(memory: FoldMemory, id: string, open: boolean): FoldMemory {
  return { ...memory, folds: { ...memory.folds, [id]: open } };
}

export function withFoldsOpen(memory: FoldMemory, ids: readonly string[]): FoldMemory {
  return ids.reduce((next, id) => withFold(next, id, true), memory);
}

export function withSection(memory: FoldMemory, section: string, open: boolean): FoldMemory {
  const folds = Object.fromEntries(Object.entries(memory.folds).filter(([id]) => sectionOf(id) !== section));
  return { folds, sections: { ...memory.sections, [section]: open } };
}

/** The minimum of a DOM element that `foldIdsAround` needs. */
export interface FoldNode {
  closest(selector: string): FoldNode | null;
  getAttribute(name: string): string | null;
  parentElement: FoldNode | null;
}

/** Ids of every fold that contains `target` (itself included), innermost first. */
export function foldIdsAround(target: FoldNode): string[] {
  const ids: string[] = [];
  for (let fold = target.closest("[data-fold-id]"); fold; fold = fold.parentElement?.closest("[data-fold-id]") ?? null) {
    const id = fold.getAttribute("data-fold-id");
    if (id) ids.push(id);
  }
  return ids;
}

export const FOLD_STORAGE_KEY = "hamad-coach-folds";

function booleans(value: unknown): Record<string, boolean> {
  if (typeof value !== "object" || value === null) return {};
  return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, boolean] => typeof entry[1] === "boolean"));
}

export function loadFoldMemory(): FoldMemory {
  try {
    const value = JSON.parse(localStorage.getItem(FOLD_STORAGE_KEY) ?? "null") as Partial<FoldMemory> | null;
    return value ? { folds: booleans(value.folds), sections: booleans(value.sections) } : EMPTY_FOLDS;
  } catch {
    return EMPTY_FOLDS;
  }
}

export function saveFoldMemory(memory: FoldMemory): void {
  try { localStorage.setItem(FOLD_STORAGE_KEY, JSON.stringify(memory)); } catch { /* Folds still work for this visit. */ }
}
