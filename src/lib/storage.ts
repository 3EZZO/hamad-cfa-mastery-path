import { getWeekSessions, PLAN, TOPICS } from "../data/plan";
import type {
  DiagnosticEntry,
  ErrorEntry,
  MockScore,
  NoteEntry,
  PracticeLog,
  SessionOverride,
  SessionLog,
  TrackerState,
} from "../types";
import { isValidDateOnly } from "./dates";
import { validateEffectiveSessionSchedule } from "./schedule";

export const STORAGE_KEY = "project-202-tracker-v1";
export const PENDING_SYNC_KEY = "project-202-pending-sync-v1";

export interface PendingSync {
  version: 1;
  baseRevision: number;
  baseState: TrackerState;
  localState: TrackerState;
  queuedAt: string;
  mutationId: string;
}

export function createDefaultState(): TrackerState {
  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    taskCompletions: {},
    topicMastery: Object.fromEntries(TOPICS.map((topic) => [topic, 0])),
    sessionLogs: [],
    practiceLogs: [],
    mockScores: [],
    errorEntries: [],
    notes: [],
    sessionOverrides: {},
    diagnostics: [],
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const ERROR_CATEGORIES = new Set([
  "Concept gap",
  "Formula / process",
  "Reading error",
  "Time pressure",
  "Guessing discipline",
  "Confidence error",
]);

const NOTE_CATEGORIES = new Set([
  "Shared tutor note",
  "Weekly reflection",
  "Commitment",
  "Resource link",
  "Exam logistics",
]);

const SESSION_INDEX = new Map(
  PLAN.flatMap((week) =>
    getWeekSessions(week).map((session) => [
      session.number,
      { week: week.week, durationMinutes: session.durationMinutes },
    ] as const),
  ),
);

function clippedText(
  value: unknown,
  maxLength: number,
  fallback = "",
): string {
  return (typeof value === "string" ? value : fallback).slice(0, maxLength);
}

function recordId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const id = value.trim().slice(0, 120);
  return id || null;
}

function boundedNumber(
  value: unknown,
  minimum: number,
  maximum: number,
  fallback: number,
): number {
  const number = Number(value);
  return Number.isFinite(number)
    ? Math.max(minimum, Math.min(maximum, number))
    : fallback;
}

function boundedInteger(
  value: unknown,
  minimum: number,
  maximum: number,
  fallback: number,
): number {
  return Math.round(boundedNumber(value, minimum, maximum, fallback));
}

function validTimestamp(value: unknown, fallback: string): string {
  return typeof value === "string" &&
    value.length <= 40 &&
    !Number.isNaN(Date.parse(value))
    ? value
    : fallback;
}

function normalizedRecords<T extends { id: string }>(
  value: unknown,
  limit: number,
  normalize: (raw: Record<string, unknown>) => T | null,
): T[] {
  if (!Array.isArray(value)) return [];
  const records: T[] = [];
  const ids = new Set<string>();
  for (const raw of value) {
    if (!isRecord(raw)) continue;
    const record = normalize(raw);
    if (!record || ids.has(record.id)) continue;
    ids.add(record.id);
    records.push(record);
    if (records.length >= limit) break;
  }
  return records;
}

function normalizeSessionLogs(value: unknown): SessionLog[] {
  return normalizedRecords(value, 300, (raw) => {
    const id = recordId(raw.id);
    const sessionNumber = boundedInteger(raw.sessionNumber, 1, 68, 0);
    const planned = SESSION_INDEX.get(sessionNumber);
    if (!id || !isValidDateOnly(raw.date) || !planned) return null;
    return {
      id,
      date: raw.date,
      sessionNumber,
      week: planned.week,
      type: clippedText(raw.type, 80, "Tutor session"),
      durationMinutes: boundedInteger(
        raw.durationMinutes,
        15,
        240,
        planned.durationMinutes,
      ),
      focus: clippedText(raw.focus, 120),
      outcome: clippedText(raw.outcome, 600),
      nextAction: clippedText(raw.nextAction, 400),
    };
  });
}

function normalizePracticeLogs(value: unknown): PracticeLog[] {
  return normalizedRecords(value, 5_000, (raw) => {
    const id = recordId(raw.id);
    if (
      !id ||
      !isValidDateOnly(raw.date) ||
      typeof raw.topic !== "string" ||
      !TOPICS.includes(raw.topic as (typeof TOPICS)[number])
    ) {
      return null;
    }
    const attempted = boundedInteger(raw.attempted, 1, 500, 1);
    return {
      id,
      date: raw.date,
      topic: raw.topic,
      attempted,
      correct: boundedInteger(raw.correct, 0, attempted, 0),
      source: clippedText(raw.source, 80),
      note: clippedText(raw.note, 500),
    };
  });
}

function normalizeMockScores(value: unknown): MockScore[] {
  return normalizedRecords(value, 100, (raw) => {
    const id = recordId(raw.id);
    if (!id || !isValidDateOnly(raw.date)) return null;
    return {
      id,
      date: raw.date,
      label: clippedText(raw.label, 50, "Mock result"),
      score: boundedNumber(raw.score, 0, 100, 0),
      note: clippedText(raw.note, 500),
    };
  });
}

function normalizeErrorEntries(value: unknown): ErrorEntry[] {
  return normalizedRecords(value, 2_000, (raw) => {
    const id = recordId(raw.id);
    if (
      !id ||
      !isValidDateOnly(raw.date) ||
      typeof raw.topic !== "string" ||
      !TOPICS.includes(raw.topic as (typeof TOPICS)[number])
    ) {
      return null;
    }
    return {
      id,
      date: raw.date,
      topic: raw.topic,
      category:
        typeof raw.category === "string" && ERROR_CATEGORIES.has(raw.category)
          ? raw.category
          : "Concept gap",
      summary: clippedText(raw.summary, 300),
      correction: clippedText(raw.correction, 400),
      revisitDate: isValidDateOnly(raw.revisitDate) ? raw.revisitDate : "",
      resolved: raw.resolved === true,
    };
  });
}

function normalizeNotes(value: unknown): NoteEntry[] {
  return normalizedRecords(value, 1_000, (raw) => {
    const id = recordId(raw.id);
    if (!id || !isValidDateOnly(raw.date)) return null;
    return {
      id,
      date: raw.date,
      category:
        typeof raw.category === "string" && NOTE_CATEGORIES.has(raw.category)
          ? raw.category
          : "Shared tutor note",
      title: clippedText(raw.title, 100),
      body: clippedText(raw.body, 2_000),
    };
  });
}

function normalizeSessionOverrides(
  value: unknown,
  fallbackTimestamp: string,
): Record<string, SessionOverride> {
  if (!isRecord(value)) return {};
  const overrides: Record<string, SessionOverride> = {};
  for (const [key, raw] of Object.entries(value)) {
    const keyNumber = Number(key);
    if (!Number.isInteger(keyNumber) || keyNumber < 1 || keyNumber > 68) {
      continue;
    }
    if (!isRecord(raw)) {
      throw new Error(`Session ${keyNumber} has an invalid schedule override.`);
    }
    const sessionNumber = Number(raw.sessionNumber ?? keyNumber);
    if (!Number.isInteger(sessionNumber) || sessionNumber !== keyNumber) {
      throw new Error(`Session ${keyNumber} has mismatched schedule metadata.`);
    }
    if (!isValidDateOnly(raw.date)) {
      throw new Error(`Session ${keyNumber} has an invalid calendar date.`);
    }
    const canonicalKey = String(sessionNumber);
    if (overrides[canonicalKey]) {
      throw new Error(`Session ${sessionNumber} appears more than once in the schedule.`);
    }
    overrides[canonicalKey] = {
      sessionNumber,
      date: raw.date,
      reason: clippedText(
        raw.reason,
        300,
        "Tutor-approved schedule adjustment",
      ),
      updatedAt: validTimestamp(raw.updatedAt, fallbackTimestamp),
    };
  }
  validateEffectiveSessionSchedule(overrides);
  return overrides;
}

function normalizeDiagnostics(value: unknown): DiagnosticEntry[] {
  return normalizedRecords(value, 100, (raw) => {
    const id = recordId(raw.id);
    if (!id || !isValidDateOnly(raw.date)) return null;
    const attempted = boundedInteger(raw.attempted, 0, 500, 0);
    const correct = boundedInteger(raw.correct, 0, attempted, 0);
    return {
      id,
      date: raw.date,
      sessionNumber: 1,
      status: raw.status === "final" ? "final" : "draft",
      attempted,
      correct,
      studyHoursPerWeek: boundedNumber(raw.studyHoursPerWeek, 0, 80, 0),
      pacingRating: boundedInteger(raw.pacingRating, 1, 5, 1),
      confidenceRating: boundedInteger(raw.confidenceRating, 1, 5, 1),
      calculatorReady: raw.calculatorReady === true,
      priorityTopics: (Array.isArray(raw.priorityTopics) ? raw.priorityTopics : [])
        .filter((item): item is string => typeof item === "string")
        .filter((item): item is (typeof TOPICS)[number] =>
          TOPICS.includes(item as (typeof TOPICS)[number]),
        )
        .filter((item, index, items) => items.indexOf(item) === index)
        .slice(0, 10),
      strengths: clippedText(raw.strengths, 1_000),
      barriers: clippedText(raw.barriers, 1_000),
      tutorPlan: clippedText(raw.tutorPlan, 2_000),
    };
  });
}

export function normalizeState(value: unknown): TrackerState {
  if (!isRecord(value) || value.version !== 1) {
    throw new Error("This is not a valid Project 202 version 1 backup.");
  }

  const defaults = createDefaultState();
  const rawMastery = isRecord(value.topicMastery) ? value.topicMastery : {};
  const topicMastery = Object.fromEntries(
    TOPICS.map((topic) => {
      const raw = Number(rawMastery[topic] ?? 0);
      return [topic, Number.isFinite(raw) ? Math.max(0, Math.min(100, raw)) : 0];
    }),
  );

  const taskCompletions: Record<string, boolean> = isRecord(
    value.taskCompletions,
  )
    ? Object.fromEntries(
        Object.entries(value.taskCompletions)
          .filter(
            ([key, complete]) =>
              key.length > 0 && key.length <= 120 && typeof complete === "boolean",
          )
          .map(([key, complete]) => [key, complete as boolean] as const)
          .slice(0, 1_000),
      )
    : {};

  const normalizedUpdatedAt = validTimestamp(
    value.updatedAt,
    defaults.updatedAt,
  );

  return {
    ...defaults,
    updatedAt: normalizedUpdatedAt,
    taskCompletions,
    topicMastery,
    sessionLogs: normalizeSessionLogs(value.sessionLogs),
    practiceLogs: normalizePracticeLogs(value.practiceLogs),
    mockScores: normalizeMockScores(value.mockScores),
    errorEntries: normalizeErrorEntries(value.errorEntries),
    notes: normalizeNotes(value.notes),
    sessionOverrides: normalizeSessionOverrides(
      value.sessionOverrides,
      normalizedUpdatedAt,
    ),
    diagnostics: normalizeDiagnostics(value.diagnostics),
  };
}

export function loadState(): TrackerState {
  if (typeof window === "undefined") return createDefaultState();
  const saved = window.localStorage.getItem(STORAGE_KEY);
  if (!saved) return createDefaultState();
  try {
    return normalizeState(JSON.parse(saved));
  } catch {
    return createDefaultState();
  }
}

export function saveState(state: TrackerState): TrackerState {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  return state;
}

export function loadPendingSync(): PendingSync | null {
  if (typeof window === "undefined") return null;
  const saved = window.localStorage.getItem(PENDING_SYNC_KEY);
  if (!saved) return null;
  try {
    const value = JSON.parse(saved) as Partial<PendingSync>;
    if (
      value.version !== 1 ||
      !Number.isInteger(value.baseRevision) ||
      Number(value.baseRevision) < 0
    ) {
      throw new Error("Invalid pending sync metadata.");
    }
    return {
      version: 1,
      baseRevision: Number(value.baseRevision),
      baseState: normalizeState(value.baseState),
      localState: normalizeState(value.localState),
      queuedAt:
        typeof value.queuedAt === "string"
          ? value.queuedAt
          : new Date().toISOString(),
      mutationId:
        typeof value.mutationId === "string" && value.mutationId
          ? value.mutationId
          : `${value.queuedAt ?? "legacy"}:${value.localState?.updatedAt ?? "pending"}`,
    };
  } catch {
    window.localStorage.removeItem(PENDING_SYNC_KEY);
    return null;
  }
}

export function savePendingSync(pending: PendingSync): PendingSync {
  window.localStorage.setItem(PENDING_SYNC_KEY, JSON.stringify(pending));
  return pending;
}

export function clearPendingSync(): void {
  if (typeof window !== "undefined") {
    window.localStorage.removeItem(PENDING_SYNC_KEY);
  }
}

export function downloadBackup(state: TrackerState): void {
  const payload = JSON.stringify(
    { ...state, updatedAt: new Date().toISOString() },
    null,
    2,
  );
  const blob = new Blob([payload], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  const date = new Date().toISOString().slice(0, 10);
  anchor.href = url;
  anchor.download = `project-202-backup-${date}.json`;
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

export async function readBackup(file: File): Promise<TrackerState> {
  const text = await file.text();
  return normalizeState(JSON.parse(text));
}
