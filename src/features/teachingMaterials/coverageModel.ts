/**
 * Teaching coverage: which pages of a PDF were actually taught, and for how
 * long. A page counts once it has been on screen for DWELL_MS while the
 * session clock runs on the PDF surface (never in practice mode). Coverage
 * measures time on a page, not understanding; it reaches the session log
 * only through the tutor's confirmed summary.
 */

export interface PageCoverage {
  versionId: string;
  /** Compact sorted ranges, e.g. "1-4,7,9-12". */
  pages: string;
  /** Seconds of running session clock with this PDF on screen. */
  seconds: number;
}

export const DWELL_MS = 20_000;
export const MAX_COVERAGE_ENTRIES = 50;
export const MAX_PAGES_TEXT = 600;
export const MAX_COVERAGE_SECONDS = 8 * 60 * 60;
const MAX_PAGE = 10_000;

export function parsePages(text: string): number[] {
  const pages = new Set<number>();
  for (const part of text.split(",")) {
    const match = /^(\d+)(?:-(\d+))?$/.exec(part.trim());
    if (!match) continue;
    const start = Number(match[1]);
    const end = Number(match[2] ?? match[1]);
    if (start < 1 || end < start || end > MAX_PAGE) continue;
    for (let page = start; page <= end; page += 1) pages.add(page);
  }
  return [...pages].sort((a, b) => a - b);
}

export function formatPages(pages: Iterable<number>): string {
  const sorted = [...new Set(pages)].filter(page => Number.isInteger(page) && page >= 1 && page <= MAX_PAGE).sort((a, b) => a - b);
  const ranges: string[] = [];
  for (let index = 0; index < sorted.length;) {
    let end = index;
    while (end + 1 < sorted.length && sorted[end + 1] === sorted[end]! + 1) end += 1;
    ranges.push(end === index ? String(sorted[index]) : `${sorted[index]}-${sorted[end]}`);
    index = end + 1;
  }
  return ranges.join(",");
}

/** Human form for summaries: "pp. 1–4, 7" or "p. 7". */
export function describePages(text: string): string {
  if (!text) return "no pages yet";
  const single = /^\d+$/.test(text);
  return `${single ? "p." : "pp."} ${text.replace(/-/g, "–").replace(/,/g, ", ")}`;
}

function update(list: readonly PageCoverage[], versionId: string, change: (entry: PageCoverage) => PageCoverage): PageCoverage[] {
  const existing = list.find(entry => entry.versionId === versionId) ?? { versionId, pages: "", seconds: 0 };
  const next = change(existing);
  if (next.pages.length > MAX_PAGES_TEXT) return [...list];
  const others = list.filter(entry => entry.versionId !== versionId);
  // The newest PDF stays; the oldest drops once the bounded list is full.
  return [...others, next].slice(-MAX_COVERAGE_ENTRIES);
}

export function withTaughtPage(list: readonly PageCoverage[], versionId: string, page: number): PageCoverage[] {
  const current = list.find(entry => entry.versionId === versionId);
  if (current && parsePages(current.pages).includes(page)) return [...list];
  return update(list, versionId, entry => ({ ...entry, pages: formatPages([...parsePages(entry.pages), page]) }));
}

export function withTeachingSeconds(list: readonly PageCoverage[], versionId: string, seconds: number): PageCoverage[] {
  if (!(seconds > 0)) return [...list];
  return update(list, versionId, entry => ({ ...entry, seconds: Math.min(MAX_COVERAGE_SECONDS, Math.round(entry.seconds + seconds)) }));
}

/** Two copies of the same session's coverage: union of pages, larger time. */
export function mergeCoverage(a: readonly PageCoverage[], b: readonly PageCoverage[]): PageCoverage[] {
  let merged = [...a];
  for (const entry of b) {
    merged = update(merged, entry.versionId, current => ({
      versionId: entry.versionId,
      pages: formatPages([...parsePages(current.pages), ...parsePages(entry.pages)]),
      seconds: Math.max(current.seconds, entry.seconds),
    }));
  }
  return merged;
}

export function sanitizeCoverage(value: unknown): PageCoverage[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap(item => {
    if (typeof item !== "object" || item === null) return [];
    const entry = item as Record<string, unknown>;
    if (typeof entry.versionId !== "string" || !entry.versionId || entry.versionId.length > 200) return [];
    if (typeof entry.pages !== "string" || entry.pages.length > MAX_PAGES_TEXT) return [];
    const seconds = Number(entry.seconds);
    if (!Number.isFinite(seconds) || seconds < 0) return [];
    return [{ versionId: entry.versionId, pages: formatPages(parsePages(entry.pages)), seconds: Math.min(MAX_COVERAGE_SECONDS, Math.round(seconds)) }];
  }).slice(-MAX_COVERAGE_ENTRIES);
}

/** Pages taught per PDF version across several sessions' records. */
export function taughtPagesByVersion(lists: readonly (readonly PageCoverage[])[]): Map<string, Set<number>> {
  const result = new Map<string, Set<number>>();
  for (const list of lists) {
    for (const entry of list) {
      const pages = result.get(entry.versionId) ?? new Set<number>();
      parsePages(entry.pages).forEach(page => pages.add(page));
      result.set(entry.versionId, pages);
    }
  }
  return result;
}
