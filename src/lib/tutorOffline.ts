import {
  parseTutorPlaybookChunk,
  parseTutorPlaybookManifest,
  parseTutorLiveRunAction,
  tutorPlaybookPackageToDraft,
  validateTutorPlaybookPackage,
  verifyTutorPlaybookPackageIntegrity,
  type TutorLiveRunAction,
  type TutorPlaybookPackage,
} from "./tutorContent";
import type { LiveSessionRunSnapshot } from "../features/liveSession";

const DATABASE_NAME = "hamad-cfa-tutor-workspace-v1";
const DATABASE_VERSION = 3;
const STORE_NAME = "playbooks";
const RUN_STORE_NAME = "runs";
const ACTION_STORE_NAME = "runActions";

interface OfflinePlaybookEnvelope {
  key: string;
  uid: string;
  playbookId: string;
  version: string;
  contentHash: string;
  storedAt: string;
  package: TutorPlaybookPackage;
}

interface OfflineRunEnvelope {
  key: string;
  uid: string;
  runId: string;
  storedAt: string;
  snapshot: LiveSessionRunSnapshot;
}

export type TutorRunJournalAction = Omit<
  TutorLiveRunAction,
  "id" | "atClient" | "elapsedSeconds"
>;

export interface TutorRunJournalEntry {
  schemaVersion: 1;
  key: string;
  scope: string;
  uid: string;
  runId: string;
  eventId: string;
  order: number;
  queuedAt: string;
  action: TutorRunJournalAction;
  snapshot: LiveSessionRunSnapshot;
}

let lastJournalOrder = 0;

export interface TutorOfflineStatus {
  ready: boolean;
  version: string | null;
  contentHash: string | null;
  storedAt: string | null;
}

export function isTutorOfflineSupported(): boolean {
  return typeof window !== "undefined" && "indexedDB" in window;
}

function requireIndexedDb(): IDBFactory {
  if (!isTutorOfflineSupported()) {
    throw new Error(
      "Private offline preparation is not supported by this browser."
    );
  }
  return window.indexedDB;
}

function envelopeKey(uid: string, playbookId: string): string {
  return `${uid.trim()}:${playbookId.trim()}`;
}

function openDatabase(): Promise<IDBDatabase> {
  const indexedDb = requireIndexedDb();
  return new Promise((resolve, reject) => {
    const request = indexedDb.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        const store = database.createObjectStore(STORE_NAME, {
          keyPath: "key",
        });
        store.createIndex("uid", "uid", { unique: false });
      }
      if (!database.objectStoreNames.contains(RUN_STORE_NAME)) {
        const store = database.createObjectStore(RUN_STORE_NAME, {
          keyPath: "key",
        });
        store.createIndex("uid", "uid", { unique: false });
      }
      if (!database.objectStoreNames.contains(ACTION_STORE_NAME)) {
        const store = database.createObjectStore(ACTION_STORE_NAME, {
          keyPath: "key",
        });
        store.createIndex("uid", "uid", { unique: false });
        store.createIndex("scope", "scope", { unique: false });
      }
    };
    request.onsuccess = () => {
      request.result.onversionchange = () => request.result.close();
      resolve(request.result);
    };
    request.onerror = () =>
      reject(
        request.error ?? new Error("Unable to open private offline storage.")
      );
    request.onblocked = () =>
      reject(
        new Error("Private offline storage is blocked by another tracker tab.")
      );
  });
}

async function runRequest<T>(
  storeName:
    | typeof STORE_NAME
    | typeof RUN_STORE_NAME
    | typeof ACTION_STORE_NAME,
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
  const database = await openDatabase();
  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = database.transaction(storeName, mode);
      const request = operation(transaction.objectStore(storeName));
      let result: T;
      let requestSucceeded = false;
      let settled = false;
      const fail = (error: unknown) => {
        if (settled) return;
        settled = true;
        reject(error);
      };
      request.onsuccess = () => {
        result = request.result;
        requestSucceeded = true;
      };
      request.onerror = () =>
        fail(request.error ?? new Error("Private offline storage failed."));
      transaction.oncomplete = () => {
        if (settled) return;
        if (!requestSucceeded) {
          fail(new Error("Private offline storage completed without a result."));
          return;
        }
        settled = true;
        resolve(result!);
      };
      transaction.onerror = () =>
        fail(transaction.error ?? new Error("Private offline storage failed."));
      transaction.onabort = () =>
        fail(
          transaction.error ??
            new Error("Private offline storage was interrupted.")
        );
    });
  } finally {
    database.close();
  }
}

async function parseCachedPackage(
  value: unknown
): Promise<TutorPlaybookPackage | null> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as Partial<OfflinePlaybookEnvelope>;
  if (!candidate.package || typeof candidate.package !== "object") return null;
  try {
    const manifest = parseTutorPlaybookManifest(
      (candidate.package as TutorPlaybookPackage).manifest
    );
    const chunks = (candidate.package as TutorPlaybookPackage).chunks.map(
      parseTutorPlaybookChunk
    );
    const safe = validateTutorPlaybookPackage(manifest, chunks);
    await verifyTutorPlaybookPackageIntegrity(
      tutorPlaybookPackageToDraft(safe.manifest, safe.chunks)
    );
    return safe;
  } catch {
    return null;
  }
}

export async function cacheTutorPlaybookOffline(
  uid: string,
  playbook: TutorPlaybookPackage
): Promise<TutorOfflineStatus> {
  const safe = validateTutorPlaybookPackage(playbook.manifest, playbook.chunks);
  const storedAt = new Date().toISOString();
  const envelope: OfflinePlaybookEnvelope = {
    key: envelopeKey(uid, safe.manifest.id),
    uid,
    playbookId: safe.manifest.id,
    version: safe.manifest.version,
    contentHash: safe.manifest.contentHash,
    storedAt,
    package: safe,
  };
  await runRequest(STORE_NAME, "readwrite", store => store.put(envelope));
  return {
    ready: true,
    version: envelope.version,
    contentHash: envelope.contentHash,
    storedAt,
  };
}

export async function loadTutorPlaybookOffline(
  uid: string,
  playbookId: string
): Promise<TutorPlaybookPackage | null> {
  const value = await runRequest<unknown>(STORE_NAME, "readonly", store =>
    store.get(envelopeKey(uid, playbookId))
  );
  return await parseCachedPackage(value);
}

export async function getTutorOfflineStatus(
  uid: string,
  playbookId: string
): Promise<TutorOfflineStatus> {
  if (!isTutorOfflineSupported()) {
    return {
      ready: false,
      version: null,
      contentHash: null,
      storedAt: null,
    };
  }
  const value = await runRequest<unknown>(STORE_NAME, "readonly", store =>
    store.get(envelopeKey(uid, playbookId))
  );
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {
      ready: false,
      version: null,
      contentHash: null,
      storedAt: null,
    };
  }
  const candidate = value as Partial<OfflinePlaybookEnvelope>;
  return {
    ready: Boolean(await parseCachedPackage(candidate)),
    version: typeof candidate.version === "string" ? candidate.version : null,
    contentHash:
      typeof candidate.contentHash === "string" ? candidate.contentHash : null,
    storedAt:
      typeof candidate.storedAt === "string" ? candidate.storedAt : null,
  };
}

export async function removeTutorPlaybookOffline(
  uid: string,
  playbookId: string
): Promise<void> {
  if (!isTutorOfflineSupported()) return;
  await runRequest(STORE_NAME, "readwrite", store =>
    store.delete(envelopeKey(uid, playbookId))
  );
}

function runEnvelopeKey(uid: string, runId: string): string {
  return `${uid.trim()}:${runId.trim()}`;
}

function runJournalScope(uid: string, runId: string): string {
  return `${uid.trim()}:${runId.trim()}`;
}

function runJournalKey(uid: string, runId: string, eventId: string): string {
  return `${runJournalScope(uid, runId)}:${eventId.trim()}`;
}

function parseRunSnapshot(value: unknown): LiveSessionRunSnapshot | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as Partial<LiveSessionRunSnapshot>;
  if (
    !["launch", "running", "closeout", "complete"].includes(
      candidate.phase ?? ""
    ) ||
    !Array.isArray(candidate.evidence) ||
    (candidate.completedDeskIds !== undefined &&
      (!Array.isArray(candidate.completedDeskIds) ||
        candidate.completedDeskIds.some(item => typeof item !== "string"))) ||
    typeof candidate.stageIndex !== "number" ||
    typeof candidate.questionIndex !== "number" ||
    typeof candidate.updatedAt !== "string"
  ) {
    return null;
  }
  return candidate as LiveSessionRunSnapshot;
}

function nextJournalOrder(): number {
  const candidate = Date.now() * 1_000;
  lastJournalOrder = Math.max(candidate, lastJournalOrder + 1);
  return lastJournalOrder;
}

function parseJournalEntry(value: unknown): TutorRunJournalEntry | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as Partial<TutorRunJournalEntry>;
  if (
    candidate.schemaVersion !== 1 ||
    typeof candidate.uid !== "string" ||
    !candidate.uid.trim() ||
    typeof candidate.runId !== "string" ||
    !candidate.runId.trim() ||
    typeof candidate.eventId !== "string" ||
    !candidate.eventId.trim() ||
    typeof candidate.order !== "number" ||
    !Number.isSafeInteger(candidate.order) ||
    candidate.order < 0 ||
    typeof candidate.queuedAt !== "string" ||
    !Number.isFinite(Date.parse(candidate.queuedAt)) ||
    typeof candidate.action !== "object" ||
    !candidate.action ||
    Array.isArray(candidate.action)
  ) {
    return null;
  }
  const scope = runJournalScope(candidate.uid, candidate.runId);
  const key = runJournalKey(candidate.uid, candidate.runId, candidate.eventId);
  if (candidate.scope !== scope || candidate.key !== key) return null;
  const snapshot = parseRunSnapshot(candidate.snapshot);
  if (!snapshot) return null;
  try {
    const parsed = parseTutorLiveRunAction({
      ...candidate.action,
      id: candidate.eventId,
      atClient: candidate.queuedAt,
      elapsedSeconds: 0,
    });
    const {
      id: _id,
      atClient: _atClient,
      elapsedSeconds: _elapsedSeconds,
      ...action
    } = parsed;
    return {
      schemaVersion: 1,
      key,
      scope,
      uid: candidate.uid,
      runId: candidate.runId,
      eventId: candidate.eventId,
      order: candidate.order,
      queuedAt: candidate.queuedAt,
      action,
      snapshot,
    };
  } catch {
    return null;
  }
}

export async function journalTutorRunAction(
  uid: string,
  runId: string,
  eventId: string,
  action: TutorRunJournalAction,
  snapshot: LiveSessionRunSnapshot
): Promise<TutorRunJournalEntry> {
  const queuedAt = new Date().toISOString();
  const candidate = parseJournalEntry({
    schemaVersion: 1,
    key: runJournalKey(uid, runId, eventId),
    scope: runJournalScope(uid, runId),
    uid,
    runId,
    eventId,
    order: nextJournalOrder(),
    queuedAt,
    action,
    snapshot,
  });
  if (!candidate) {
    throw new Error("The live-session cloud action is invalid.");
  }
  await runRequest(ACTION_STORE_NAME, "readwrite", store =>
    store.put(candidate)
  );
  return candidate;
}

export async function loadTutorRunJournal(
  uid: string,
  runId: string
): Promise<TutorRunJournalEntry[]> {
  if (!isTutorOfflineSupported()) return [];
  const scope = runJournalScope(uid, runId);
  const values = await runRequest<unknown[]>(
    ACTION_STORE_NAME,
    "readonly",
    store => store.index("scope").getAll(IDBKeyRange.only(scope))
  );
  return values
    .map(parseJournalEntry)
    .filter((entry): entry is TutorRunJournalEntry => Boolean(entry))
    .sort((left, right) =>
      left.order === right.order
        ? left.eventId.localeCompare(right.eventId)
        : left.order - right.order
    );
}

export async function removeTutorRunJournalAction(
  uid: string,
  runId: string,
  eventId: string
): Promise<void> {
  if (!isTutorOfflineSupported()) return;
  await runRequest(ACTION_STORE_NAME, "readwrite", store =>
    store.delete(runJournalKey(uid, runId, eventId))
  );
}

export async function clearTutorRunJournal(
  uid: string,
  runId: string
): Promise<void> {
  if (!isTutorOfflineSupported()) return;
  const entries = await loadTutorRunJournal(uid, runId);
  await Promise.all(
    entries.map(entry =>
      removeTutorRunJournalAction(uid, runId, entry.eventId)
    )
  );
}

export async function cacheTutorRunOffline(
  uid: string,
  runId: string,
  snapshot: LiveSessionRunSnapshot
): Promise<void> {
  const safe = parseRunSnapshot(snapshot);
  if (!safe) throw new Error("The live-session recovery snapshot is invalid.");
  const envelope: OfflineRunEnvelope = {
    key: runEnvelopeKey(uid, runId),
    uid,
    runId,
    storedAt: new Date().toISOString(),
    snapshot: safe,
  };
  await runRequest(RUN_STORE_NAME, "readwrite", store => store.put(envelope));
}

export async function loadTutorRunOffline(
  uid: string,
  runId: string
): Promise<LiveSessionRunSnapshot | null> {
  if (!isTutorOfflineSupported()) return null;
  const value = await runRequest<unknown>(RUN_STORE_NAME, "readonly", store =>
    store.get(runEnvelopeKey(uid, runId))
  );
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return parseRunSnapshot((value as Partial<OfflineRunEnvelope>).snapshot);
}

export async function removeTutorRunOffline(
  uid: string,
  runId: string
): Promise<void> {
  if (!isTutorOfflineSupported()) return;
  await runRequest(RUN_STORE_NAME, "readwrite", store =>
    store.delete(runEnvelopeKey(uid, runId))
  );
  await clearTutorRunJournal(uid, runId);
}

export async function clearTutorOfflineData(uid: string): Promise<void> {
  if (!isTutorOfflineSupported()) return;
  const database = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(
        [STORE_NAME, RUN_STORE_NAME, ACTION_STORE_NAME],
        "readwrite"
      );
      [STORE_NAME, RUN_STORE_NAME, ACTION_STORE_NAME].forEach(storeName => {
        const store = transaction.objectStore(storeName);
        const request = store.index("uid").openKeyCursor(IDBKeyRange.only(uid));
        request.onsuccess = () => {
          const cursor = request.result;
          if (!cursor) return;
          store.delete(cursor.primaryKey);
          cursor.continue();
        };
        request.onerror = () =>
          reject(
            request.error ?? new Error("Unable to clear private offline data.")
          );
      });
      transaction.oncomplete = () => resolve();
      transaction.onerror = () =>
        reject(
          transaction.error ??
            new Error("Unable to clear private offline data.")
        );
      transaction.onabort = () =>
        reject(
          transaction.error ??
            new Error("Unable to clear private offline data.")
        );
    });
  } finally {
    database.close();
  }
}
