import { formatPages, parsePages } from "./coverageModel";

/**
 * A session recap for the student, written from facts recorded during PDF
 * teaching and one line from the tutor. The tutor reviews it before sending;
 * it never contains private notes or stop prompts and never shares a PDF.
 */
export interface RecapCovered {
  label: string;
  pages: string;
}

export interface RecapKeyPage {
  versionId: string;
  label: string;
  page: number;
}

export interface SessionRecap {
  runId: string;
  sessionNumber: number;
  status: "active" | "withdrawn";
  covered: RecapCovered[];
  keyPages: RecapKeyPage[];
  checks: { correct: number; total: number } | null;
  nextStep: string;
  sentAtMs: number | null;
  revision: number;
}

export type RecapInput = Pick<SessionRecap, "runId" | "sessionNumber" | "covered" | "keyPages" | "checks" | "nextStep">;

export const MAX_RECAP_COVERED = 20;
export const MAX_RECAP_KEY_PAGES = 30;
export const MAX_RECAP_LABEL_CHARS = 200;
export const MAX_RECAP_NEXT_STEP_CHARS = 500;
const RUN_ID = /^session-\d{2}$/;

function label(value: unknown): string {
  return typeof value === "string" ? value.trim().slice(0, MAX_RECAP_LABEL_CHARS) : "";
}

/** Bounded, validated recap content (the shape both sides read and write). */
export function sanitizeRecapInput(value: Partial<RecapInput>): RecapInput | null {
  if (typeof value.runId !== "string" || !RUN_ID.test(value.runId)) return null;
  const sessionNumber = Number(value.sessionNumber);
  if (!Number.isInteger(sessionNumber) || sessionNumber < 1 || sessionNumber > 25) return null;
  const covered = (Array.isArray(value.covered) ? value.covered : []).flatMap(item => {
    const text = label(item?.label);
    const pages = typeof item?.pages === "string" ? formatPages(parsePages(item.pages)) : "";
    return text && pages ? [{ label: text, pages }] : [];
  }).slice(0, MAX_RECAP_COVERED);
  const keyPages = (Array.isArray(value.keyPages) ? value.keyPages : []).flatMap(item => {
    const text = label(item?.label);
    const page = Number(item?.page);
    return typeof item?.versionId === "string" && item.versionId && item.versionId.length <= 200 && text && Number.isInteger(page) && page >= 1 && page <= 10_000
      ? [{ versionId: item.versionId, label: text, page }] : [];
  }).slice(0, MAX_RECAP_KEY_PAGES);
  const checks = value.checks && Number.isInteger(value.checks.correct) && Number.isInteger(value.checks.total)
    && value.checks.total >= 1 && value.checks.total <= 100 && value.checks.correct >= 0 && value.checks.correct <= value.checks.total
    ? { correct: value.checks.correct, total: value.checks.total } : null;
  const nextStep = typeof value.nextStep === "string" ? value.nextStep.trim().slice(0, MAX_RECAP_NEXT_STEP_CHARS) : "";
  return { runId: value.runId, sessionNumber, covered, keyPages, checks, nextStep };
}

/** A recap has something to say: covered pages, key pages, checks or a next step. */
export function recapHasContent(input: RecapInput): boolean {
  return input.covered.length > 0 || input.keyPages.length > 0 || input.checks !== null || input.nextStep.length > 0;
}

export function parseRecap(id: string, value: unknown, sentAtMs: number | null): SessionRecap | null {
  if (typeof value !== "object" || value === null) return null;
  const record = value as Record<string, unknown>;
  const input = sanitizeRecapInput(record as Partial<RecapInput>);
  const revision = Number(record.revision);
  if (!input || input.runId !== id || (record.status !== "active" && record.status !== "withdrawn")
    || !Number.isSafeInteger(revision) || revision < 1) return null;
  return { ...input, status: record.status, sentAtMs, revision };
}

export function formatRecapDate(ms: number | null): string {
  if (ms === null) return "Sent recently";
  return `Sent ${new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" }).format(new Date(ms))}`;
}

export function recapTitle(recap: Pick<SessionRecap, "sessionNumber">): string {
  return `Session ${String(recap.sessionNumber).padStart(2, "0")} recap`;
}

/** Newest session first. */
export function sortRecaps<T extends Pick<SessionRecap, "sessionNumber" | "sentAtMs">>(recaps: readonly T[]): T[] {
  return [...recaps].sort((a, b) => b.sessionNumber - a.sessionNumber || (b.sentAtMs ?? 0) - (a.sentAtMs ?? 0));
}

// A key-page link asks the student's reader to open at that page once.
const pendingPages = new Map<string, number>();
export function requestStudentPage(versionId: string, page: number): void {
  pendingPages.set(versionId, page);
}
export function takeStudentPage(versionId: string): number | null {
  const page = pendingPages.get(versionId) ?? null;
  pendingPages.delete(versionId);
  return page;
}
