import { addDays, isValidDateOnly } from "./dates";

export const TRACKER_SCHEDULE_VERSION = "weekly-saturday-v4" as const;
export const PRE_RESCHEDULE_BACKUP_KEY = "project-202-before-september-18";
type RecordValue = Record<string, unknown>;
const record = (value: unknown): value is RecordValue =>
  typeof value === "object" && value !== null && !Array.isArray(value);

// Keep recovery separate from the public app shell and never replace it.
export function preservePreRescheduleBackup(source: string, value: unknown): void {
  if (typeof window === "undefined") return;
  try {
    const key = `${PRE_RESCHEDULE_BACKUP_KEY}-${source}`;
    if (!window.localStorage.getItem(key)) {
      window.localStorage.setItem(key, JSON.stringify(value));
    }
  } catch {
    // A full browser store must not prevent cloud recovery or normalization.
  }
}

function newNumber(old: number): number {
  return old === 20 ? 19 : old > 20 ? old - 1 : old;
}

function activeTaskId(id: string): string | null {
  const match = /^w(\d+)-(.*)$/.exec(id);
  if (!match) return id;
  const week = Number(match[1]);
  const suffix = match[2]!;
  // Neither old meeting alone approves the newly combined checkpoint.
  if ((week === 19 || week === 20) && /^(session-|evidence-gate)/.test(suffix)) return null;
  if (week === 20) {
    if (suffix === "independent-1") return "w19-independent-5";
    if (suffix === "independent-3") return "w19-independent-4";
    return null;
  }
  // The mock-week question targets increased; the old target is history,
  // not evidence that the larger assignment is complete.
  if ([18, 19, 21, 22, 23, 24, 25].includes(week) && suffix === "independent-3") return null;
  return `w${newNumber(week)}-${suffix}`;
}

function migrateTaskMap(value: unknown, approval = false): RecordValue {
  if (!record(value)) return {};
  const result: RecordValue = {};
  for (const [key, item] of Object.entries(value)) {
    const archivedKey = `legacy-v2-${key}`;
    result[archivedKey] = approval && record(item) ? { ...item, taskId: archivedKey } : item;
    const mappedKey = activeTaskId(key);
    if (mappedKey !== null) {
      result[mappedKey] = approval && record(item) ? { ...item, taskId: mappedKey } : item;
    }
  }
  return result;
}

/** Deterministic, idempotent migration for local, cloud and queued snapshots. */
function migrateV2ToV3(value: RecordValue): RecordValue {
  if (value.scheduleVersion !== "weekly-saturday-v2") return value;
  const completions = migrateTaskMap(value.taskCompletions);
  const oldCompletions = record(value.taskCompletions) ? value.taskCompletions : {};
  if (oldCompletions["w19-evidence-gate"] === true && oldCompletions["w20-evidence-gate"] === true) {
    completions["w19-evidence-gate"] = true;
  }
  const notes = Array.isArray(value.notes) ? [...value.notes] : [];
  const overrides: RecordValue = {};
  if (record(value.sessionOverrides)) {
    for (const [key, item] of Object.entries(value.sessionOverrides)) {
      const number = Number(key);
      if (!record(item) || !Number.isInteger(number) || number < 1 || number > 25) continue;
      const canonical = addDays("2026-09-05", (number - 1) * 7);
      const validLegacyDate = item.date === canonical || item.date === addDays(canonical, -1);
      // The confirmed S01 date supersedes any prior exception. Preserve all
      // original override decisions as visible audit notes, including S20.
      notes.push({
        id: `schedule-v2-override-${number}`,
        date: "2026-09-08",
        category: "Shared tutor note",
        title: `Previous schedule: Session ${String(number).padStart(2, "0")}`,
        body: JSON.stringify(item).slice(0, 2000),
      });
      if (number === 1 || number === 20 || !validLegacyDate || !isValidDateOnly(item.date)) continue;
      const mapped = newNumber(number);
      overrides[String(mapped)] = {
        ...item,
        sessionNumber: mapped,
        date: number < 20 ? addDays(item.date, 7) : item.date,
      };
    }
  }
  return {
    ...value,
    scheduleVersion: "weekly-saturday-v3",
    taskCompletions: completions,
    sessionCompletionRequests: migrateTaskMap(value.sessionCompletionRequests, true),
    sessionCompletionReviews: migrateTaskMap(value.sessionCompletionReviews, true),
    sessionOverrides: overrides,
    notes,
    sessionLogs: Array.isArray(value.sessionLogs) ? value.sessionLogs.map(item =>
      record(item) ? { ...item, sessionNumber: newNumber(Number(item.sessionNumber)) } : item
    ) : value.sessionLogs,
    mockScores: Array.isArray(value.mockScores) ? value.mockScores.map(item =>
      record(item) && Number.isInteger(item.milestoneWeek)
        ? { ...item, milestoneWeek: newNumber(Number(item.milestoneWeek)) }
        : item
    ) : value.mockScores,
  };
}

function delayedTaskId(id: string): string | null {
  const match = /^w(\d+)-(.*)$/.exec(id);
  if (!match) return id;
  const week = Number(match[1]);
  const suffix = match[2]!;
  if (week <= 22) return `w${week + 1}-${suffix}`;
  if (week === 25) return id;
  return null;
}

function migrateV3TaskMap(value: unknown, approval = false): RecordValue {
  if (!record(value)) return {};
  const result: RecordValue = {};
  for (const [key, item] of Object.entries(value)) {
    const archivedKey = `legacy-v3-${key}`;
    result[archivedKey] = approval && record(item)
      ? { ...item, taskId: archivedKey }
      : item;
    const mappedKey = delayedTaskId(key);
    if (mappedKey) {
      result[mappedKey] = approval && record(item)
        ? { ...item, taskId: mappedKey }
        : item;
    }
  }
  return result;
}

function migrateV3ToV4(value: RecordValue): RecordValue {
  if (value.scheduleVersion !== "weekly-saturday-v3") return value;
  const notes = Array.isArray(value.notes) ? [...value.notes] : [];
  if (record(value.sessionOverrides)) {
    for (const [key, item] of Object.entries(value.sessionOverrides)) {
      if (!record(item)) continue;
      notes.push({
        id: `schedule-v3-override-${key}`,
        date: "2026-09-12",
        category: "Shared tutor note",
        title: `Previous schedule: Session ${String(key).padStart(2, "0")}`,
        body: JSON.stringify(item).slice(0, 2000),
      });
    }
  }
  return {
    ...value,
    scheduleVersion: TRACKER_SCHEDULE_VERSION,
    taskCompletions: migrateV3TaskMap(value.taskCompletions),
    sessionCompletionRequests: migrateV3TaskMap(value.sessionCompletionRequests, true),
    sessionCompletionReviews: migrateV3TaskMap(value.sessionCompletionReviews, true),
    sessionOverrides: {},
    notes,
    mockScores: Array.isArray(value.mockScores)
      ? value.mockScores.map(item => {
          if (!record(item) || !Number.isInteger(item.milestoneWeek)) return item;
          const week = Number(item.milestoneWeek);
          return { ...item, milestoneWeek: week <= 22 ? week + 1 : week <= 24 ? 24 : week };
        })
      : value.mockScores,
  };
}

/** Deterministic, idempotent migration for local, cloud and queued snapshots. */
export function migrateSeptemberSchedule(value: RecordValue): RecordValue {
  return migrateV3ToV4(migrateV2ToV3(value));
}
