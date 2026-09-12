import type {
  PracticeQuestionState,
  PracticeRun,
  PublishedPracticeBank,
} from "./practiceContent";

const DATABASE_NAME = "hamad-practice-coach";
const DATABASE_VERSION = 1;
const BANKS = "banks";
const STATES = "states";
const RUNS = "runs";
const PENDING = "pending";

export interface PendingPracticeWrite {
  id: string;
  kind: "state" | "run";
  value: PracticeQuestionState | PracticeRun;
}

function openDatabase(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      [BANKS, STATES, RUNS, PENDING].forEach(name => {
        if (!database.objectStoreNames.contains(name)) database.createObjectStore(name);
      });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function put(storeName: string, key: string, value: unknown): Promise<void> {
  const database = await openDatabase();
  if (!database) return;
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(storeName, "readwrite");
    transaction.objectStore(storeName).put(value, key);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
  database.close();
}

async function getAll<T>(storeName: string): Promise<T[]> {
  const database = await openDatabase();
  if (!database) return [];
  const result = await new Promise<T[]>((resolve, reject) => {
    const request = database.transaction(storeName, "readonly").objectStore(storeName).getAll();
    request.onsuccess = () => resolve(request.result as T[]);
    request.onerror = () => reject(request.error);
  });
  database.close();
  return result;
}

async function remove(storeName: string, key: string): Promise<void> {
  const database = await openDatabase();
  if (!database) return;
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(storeName, "readwrite");
    transaction.objectStore(storeName).delete(key);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
  database.close();
}

async function clear(storeName: string): Promise<void> {
  const database = await openDatabase();
  if (!database) return;
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(storeName, "readwrite");
    transaction.objectStore(storeName).clear();
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
  database.close();
}

export async function cachePracticeBanks(banks: PublishedPracticeBank[]): Promise<void> {
  await clear(BANKS);
  await Promise.all(banks.map(bank => put(BANKS, bank.storageId, bank)));
}

export function loadCachedPracticeBanks(): Promise<PublishedPracticeBank[]> {
  return getAll(BANKS);
}

export async function cachePracticeState(uid: string, state: PracticeQuestionState): Promise<void> {
  await put(STATES, `${uid}:${state.questionId}`, { uid, state });
}

export async function loadCachedPracticeStates(uid: string): Promise<PracticeQuestionState[]> {
  const cached = await getAll<{ uid: string; state: PracticeQuestionState } | PracticeQuestionState>(STATES);
  return cached.flatMap(value => {
    if ("state" in value) return value.uid === uid ? [value.state] : [];
    // Version-one values did not carry an owner and are deliberately ignored.
    return [];
  });
}

export async function cachePracticeRun(run: PracticeRun): Promise<void> {
  await put(RUNS, `${run.uid}:${run.id}`, run);
}

export function loadCachedPracticeRuns(): Promise<PracticeRun[]> {
  return getAll(RUNS);
}

export async function queuePracticeWrite(write: PendingPracticeWrite): Promise<void> {
  await put(PENDING, write.id, write);
}

export function loadPendingPracticeWrites(): Promise<PendingPracticeWrite[]> {
  return getAll(PENDING);
}

export function removePendingPracticeWrite(id: string): Promise<void> {
  return remove(PENDING, id);
}
