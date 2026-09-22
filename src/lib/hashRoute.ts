/**
 * Hash route grammar: `#tab` or `#tab/segment`.
 *
 * The tab decides which view the shell renders (see hooks/useHashTab.ts);
 * the optional segment is owned by that view — a week (`#weekly/week-7`), a
 * session (`#live/session-03`) or a practice intent (`#practice/quick5`).
 * Pure helpers here; the hooks add React state and listeners.
 */

export interface HashRoute {
  tab: string;
  segment: string;
}

const SEGMENT_PATTERN = /^[a-z0-9][a-z0-9-]*$/i;

export function parseHash(hash: string | undefined): HashRoute {
  const trimmed = (typeof hash === "string" ? hash : "").replace(/^#/, "");
  const slash = trimmed.indexOf("/");
  if (slash === -1) return { tab: trimmed, segment: "" };
  const segment = trimmed.slice(slash + 1);
  return { tab: trimmed.slice(0, slash), segment: SEGMENT_PATTERN.test(segment) ? segment : "" };
}

export function buildHash(tab: string, segment = ""): string {
  return segment && SEGMENT_PATTERN.test(segment) ? `#${tab}/${segment}` : `#${tab}`;
}

/** `week-7` ⇄ 7, bounded to the plan; null when the segment is not a week. */
export function parseWeekSegment(segment: string, totalWeeks: number): number | null {
  const match = /^week-(\d{1,2})$/.exec(segment);
  if (!match) return null;
  const week = Number(match[1]);
  return week >= 1 && week <= totalWeeks ? week : null;
}

export function weekSegment(week: number): string {
  return `week-${week}`;
}

/** `session-03` ⇄ 3; null when the segment is not a session number. */
export function parseSessionSegment(segment: string): number | null {
  const match = /^session-(\d{1,2})$/.exec(segment);
  if (!match) return null;
  const number = Number(match[1]);
  return number >= 1 ? number : null;
}

export function sessionSegment(number: number): string {
  return `session-${String(number).padStart(2, "0")}`;
}

type RouteWindow = {
  location: { hash: string; href?: string };
  history?: Pick<History, "replaceState">;
};

function currentWindow(): RouteWindow | undefined {
  return typeof window === "undefined" ? undefined : (window as unknown as RouteWindow);
}

/** Segment of the current hash when it belongs to `tab`, else "". */
export function readSegment(tab: string, win: RouteWindow | undefined = currentWindow()): string {
  if (!win?.location) return "";
  const route = parseHash(win.location.hash);
  return route.tab === tab ? route.segment : "";
}

/**
 * Rewrite the segment of the current hash in place. Uses `replaceState` so
 * refining a view's position adds no history entry and fires no `hashchange`
 * (the tab hook would ignore it anyway); falls back to assigning the hash
 * where history is unavailable. Nothing happens when another tab is active,
 * so a stale effect can never relabel a different view.
 */
export function writeSegment(
  tab: string,
  segment: string,
  win: RouteWindow | undefined = currentWindow(),
): void {
  if (!win?.location) return;
  const route = parseHash(win.location.hash);
  if (route.tab !== tab || route.segment === segment) return;
  const next = buildHash(tab, segment);
  if (win.history && typeof win.history.replaceState === "function") {
    win.history.replaceState(null, "", next);
  } else {
    win.location.hash = next;
  }
}
