import type { TrackerState } from "../types";

type IdentifiedRecord = { id: string };

function hasOwn(record: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, key);
}

function mergeMap<T>(
  base: Record<string, T>,
  local: Record<string, T>,
  remote: Record<string, T>,
): Record<string, T> {
  const merged = { ...remote };
  const locallyKnownKeys = new Set([
    ...Object.keys(base),
    ...Object.keys(local),
  ]);

  for (const key of locallyKnownKeys) {
    const existedInBase = hasOwn(base, key);
    const existsLocally = hasOwn(local, key);
    const changedLocally =
      existedInBase !== existsLocally ||
      (existedInBase && existsLocally && !Object.is(base[key], local[key]));

    if (!changedLocally) continue;

    if (existsLocally) {
      merged[key] = local[key];
    } else {
      delete merged[key];
    }
  }

  return merged;
}

function changedRecordKeys<T extends IdentifiedRecord>(
  base: T,
  local: T,
): string[] {
  const baseRecord = base as unknown as Record<string, unknown>;
  const localRecord = local as unknown as Record<string, unknown>;
  const keys = new Set([
    ...Object.keys(baseRecord),
    ...Object.keys(localRecord),
  ]);

  return [...keys].filter((key) => {
    if (key === "id") return false;
    const existedInBase = hasOwn(baseRecord, key);
    const existsLocally = hasOwn(localRecord, key);
    return (
      existedInBase !== existsLocally ||
      (existedInBase &&
        existsLocally &&
        !Object.is(baseRecord[key], localRecord[key]))
    );
  });
}

function applyRecordChanges<T extends IdentifiedRecord>(
  base: T,
  local: T,
  remote: T,
  changedKeys: readonly string[],
): T {
  const localRecord = local as unknown as Record<string, unknown>;
  const merged = {
    ...(remote as unknown as Record<string, unknown>),
  };

  for (const key of changedKeys) {
    if (hasOwn(localRecord, key)) {
      merged[key] = localRecord[key];
    } else {
      delete merged[key];
    }
  }

  // Identity is the merge boundary and cannot be changed by a field patch.
  merged.id = base.id;
  return merged as unknown as T;
}

function indexById<T extends IdentifiedRecord>(
  records: readonly T[],
): Map<string, T> {
  return new Map(records.map((record) => [record.id, record]));
}

function mergeArrayById<T extends IdentifiedRecord>(
  base: readonly T[],
  local: readonly T[],
  remote: readonly T[],
): T[] {
  const baseById = indexById(base);
  const localById = indexById(local);
  const locallyDeletedIds = new Set(
    [...baseById.keys()].filter((id) => !localById.has(id)),
  );

  // Begin with the latest remote ordering and content. A local deletion is an
  // explicit change, so it removes the record even when the remote copy was
  // edited independently.
  const merged = remote.filter((record) => !locallyDeletedIds.has(record.id));
  const mergedIndex = new Map(
    merged.map((record, index) => [record.id, index]),
  );

  for (const localRecord of local) {
    const baseRecord = baseById.get(localRecord.id);
    const existingIndex = mergedIndex.get(localRecord.id);

    if (!baseRecord) {
      // The record was created locally. In the unlikely event that the same ID
      // also appeared remotely, the local addition is the local patch.
      if (existingIndex === undefined) {
        mergedIndex.set(localRecord.id, merged.length);
        merged.push(localRecord);
      } else {
        merged[existingIndex] = localRecord;
      }
      continue;
    }

    const changedKeys = changedRecordKeys(baseRecord, localRecord);
    if (changedKeys.length === 0) continue;

    if (existingIndex === undefined) {
      // A local edit and a remote deletion conflict. Applying the local diff
      // means retaining the locally edited record rather than losing the edit.
      mergedIndex.set(localRecord.id, merged.length);
      merged.push(localRecord);
      continue;
    }

    merged[existingIndex] = applyRecordChanges(
      baseRecord,
      localRecord,
      merged[existingIndex],
      changedKeys,
    );
  }

  return merged;
}

/**
 * Returns true when the state contains no user progress. Version metadata,
 * timestamps, false task values, and zero mastery values are not progress.
 */
export function isStateMeaningfullyEmpty(state: TrackerState): boolean {
  const hasCompletedTask = Object.values(state.taskCompletions).some(Boolean);
  const hasMastery = Object.values(state.topicMastery).some(
    (value) => value !== 0,
  );
  const hasArrayRecords =
    state.sessionLogs.length > 0 ||
    state.practiceLogs.length > 0 ||
    state.mockScores.length > 0 ||
    state.errorEntries.length > 0 ||
    state.notes.length > 0;

  return !hasCompletedTask && !hasMastery && !hasArrayRecords;
}

/**
 * Applies the meaningful base-to-local changes onto the latest remote state.
 * Local changes win direct conflicts; unrelated remote changes are retained.
 */
export function mergeTrackerStates(
  base: TrackerState,
  local: TrackerState,
  remote: TrackerState,
): TrackerState {
  return {
    ...remote,
    taskCompletions: mergeMap(
      base.taskCompletions,
      local.taskCompletions,
      remote.taskCompletions,
    ),
    topicMastery: mergeMap(
      base.topicMastery,
      local.topicMastery,
      remote.topicMastery,
    ),
    sessionLogs: mergeArrayById(
      base.sessionLogs,
      local.sessionLogs,
      remote.sessionLogs,
    ),
    practiceLogs: mergeArrayById(
      base.practiceLogs,
      local.practiceLogs,
      remote.practiceLogs,
    ),
    mockScores: mergeArrayById(
      base.mockScores,
      local.mockScores,
      remote.mockScores,
    ),
    errorEntries: mergeArrayById(
      base.errorEntries,
      local.errorEntries,
      remote.errorEntries,
    ),
    notes: mergeArrayById(base.notes, local.notes, remote.notes),
  };
}
