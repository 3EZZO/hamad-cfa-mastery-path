import { TOPICS } from "../data/plan";
import type { TrackerState } from "../types";

export const STORAGE_KEY = "project-202-tracker-v1";

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
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function safeArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
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

  const taskCompletions = isRecord(value.taskCompletions)
    ? Object.fromEntries(
        Object.entries(value.taskCompletions).map(([key, complete]) => [
          key,
          Boolean(complete),
        ]),
      )
    : {};

  return {
    ...defaults,
    updatedAt:
      typeof value.updatedAt === "string"
        ? value.updatedAt
        : new Date().toISOString(),
    taskCompletions,
    topicMastery,
    sessionLogs: safeArray(value.sessionLogs),
    practiceLogs: safeArray(value.practiceLogs),
    mockScores: safeArray(value.mockScores),
    errorEntries: safeArray(value.errorEntries),
    notes: safeArray(value.notes),
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
  const next = { ...state, updatedAt: new Date().toISOString() };
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  return next;
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
