import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  query,
  setDoc,
  where,
  type DocumentData,
  type Firestore,
} from "firebase/firestore";
import {
  CloudClientError,
  getCloudConfigurationStatus,
  getCloudFirestore,
  getCurrentCloudUser,
  mapCloudError,
} from "./cloud";
import {
  emptyAnswers,
  emptyDwell,
  emptyFlags,
  gradeMockAnswers,
  type MockAnswer,
  type MockFinishReason,
  type MockOption,
  type MockTestMeta,
} from "./mockTestContent";

/**
 * A tutor's own rehearsal of a module test or paper. It runs the same test
 * documents and version the student gets, is saved so a long paper survives a
 * reload, and lives in its own tutor-only collection: it never creates or
 * touches a student attempt, result, history or trend. The device clock is
 * enough here; nothing about a rehearsal is graded for the record.
 */
export interface MockRehearsal {
  id: string;
  uid: string;
  testId: string;
  testVersion: string;
  questionCount: number;
  durationSeconds: number;
  status: "active" | "finished";
  startedAtMs: number;
  updatedAtMs: number;
  finishedAtMs: number | null;
  finishReason: Exclude<MockFinishReason, "expired" | "leave"> | null;
  answers: MockAnswer[];
  flags: boolean[];
  dwellMs: number[];
  score: number | null;
  correct: boolean[] | null;
}

export interface MockRehearsalWork {
  answers: MockAnswer[];
  flags: boolean[];
  dwellMs: number[];
}

const PROGRAM_ID = "project-202";
const COLLECTION = "mockRehearsals";

function services() {
  if (!getCloudConfigurationStatus().configured) throw new CloudClientError("configuration-missing");
  const user = getCurrentCloudUser();
  if (!user) throw new CloudClientError("authentication-required");
  return { firestore: getCloudFirestore(), user };
}

function rehearsalRef(firestore: Firestore, id: string) {
  return doc(firestore, "programs", PROGRAM_ID, COLLECTION, id);
}

export function mockRehearsalId(uid: string, testId: string, startedAtMs: number): string {
  return `${uid}_${testId}_${startedAtMs}`;
}

function parseRehearsal(id: string, data: DocumentData): MockRehearsal {
  return {
    id,
    uid: String(data.uid),
    testId: String(data.testId),
    testVersion: String(data.testVersion),
    questionCount: Number(data.questionCount),
    durationSeconds: Number(data.durationSeconds),
    status: data.status === "finished" ? "finished" : "active",
    startedAtMs: Number(data.startedAtMs),
    updatedAtMs: Number(data.updatedAtMs),
    finishedAtMs: typeof data.finishedAtMs === "number" ? data.finishedAtMs : null,
    finishReason: data.finishReason ?? null,
    answers: Array.isArray(data.answers) ? data.answers : [],
    flags: Array.isArray(data.flags) ? data.flags : [],
    dwellMs: Array.isArray(data.dwellMs) ? data.dwellMs : [],
    score: typeof data.score === "number" ? data.score : null,
    correct: Array.isArray(data.correct) ? data.correct : null,
  };
}

function toDoc(rehearsal: MockRehearsal) {
  const { id: _id, ...fields } = rehearsal;
  return fields;
}

/** The tutor's rehearsals of one test, newest first. */
export async function listMockRehearsals(testId: string): Promise<MockRehearsal[]> {
  try {
    const { firestore, user } = services();
    const snapshot = await getDocs(query(
      collection(firestore, "programs", PROGRAM_ID, COLLECTION),
      where("uid", "==", user.uid),
      where("testId", "==", testId),
    ));
    return snapshot.docs
      .map(item => parseRehearsal(item.id, item.data()))
      .sort((a, b) => b.startedAtMs - a.startedAtMs);
  } catch (error) {
    throw mapCloudError(error);
  }
}

/** Start a rehearsal of the test exactly as uploaded (draft or published). */
export async function startMockRehearsal(meta: MockTestMeta, nowMs = Date.now()): Promise<MockRehearsal> {
  try {
    const { firestore, user } = services();
    const rehearsal: MockRehearsal = {
      id: mockRehearsalId(user.uid, meta.moduleId, nowMs),
      uid: user.uid,
      testId: meta.moduleId,
      testVersion: meta.version,
      questionCount: meta.questionCount,
      durationSeconds: meta.durationSeconds,
      status: "active",
      startedAtMs: nowMs,
      updatedAtMs: nowMs,
      finishedAtMs: null,
      finishReason: null,
      answers: emptyAnswers(meta.questionCount),
      flags: emptyFlags(meta.questionCount),
      dwellMs: emptyDwell(meta.questionCount),
      score: null,
      correct: null,
    };
    await setDoc(rehearsalRef(firestore, rehearsal.id), toDoc(rehearsal));
    return rehearsal;
  } catch (error) {
    throw mapCloudError(error);
  }
}

export async function saveMockRehearsal(
  rehearsal: MockRehearsal,
  work: MockRehearsalWork,
  nowMs = Date.now(),
): Promise<MockRehearsal> {
  try {
    const { firestore } = services();
    const next: MockRehearsal = { ...rehearsal, ...work, updatedAtMs: nowMs };
    await setDoc(rehearsalRef(firestore, next.id), toDoc(next));
    return next;
  } catch (error) {
    throw mapCloudError(error);
  }
}

/** Finish and grade locally against the key the tutor already holds. */
export async function finishMockRehearsal(
  rehearsal: MockRehearsal,
  work: MockRehearsalWork,
  key: readonly MockOption[],
  reason: "submit" | "timeout",
  nowMs = Date.now(),
): Promise<MockRehearsal> {
  try {
    const { firestore } = services();
    const { correct, score } = gradeMockAnswers(work.answers, key);
    const next: MockRehearsal = {
      ...rehearsal,
      ...work,
      status: "finished",
      updatedAtMs: nowMs,
      finishedAtMs: nowMs,
      finishReason: reason,
      score,
      correct,
    };
    await setDoc(rehearsalRef(firestore, next.id), toDoc(next));
    return next;
  } catch (error) {
    throw mapCloudError(error);
  }
}

export async function discardMockRehearsal(id: string): Promise<void> {
  try {
    const { firestore } = services();
    await deleteDoc(rehearsalRef(firestore, id));
  } catch (error) {
    throw mapCloudError(error);
  }
}

/** Time left on a rehearsal's device clock. */
export function mockRehearsalRemainingMs(rehearsal: Pick<MockRehearsal, "startedAtMs" | "durationSeconds">, nowMs: number): number {
  return Math.max(0, rehearsal.startedAtMs + rehearsal.durationSeconds * 1000 - nowMs);
}
