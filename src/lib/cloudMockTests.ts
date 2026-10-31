import {
  Timestamp,
  collection,
  doc,
  getDoc,
  getDocFromServer,
  getDocs,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
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
  MOCK_KIND_QUESTION_COUNT,
  MOCK_KNOWN_QUESTION_COUNTS,
  MOCK_SCHEMA_VERSION_V2,
  MockContentError,
  emptyAnswers,
  emptyDwell,
  canStartFinalMockAttempt,
  emptyFlags,
  gradeMockAnswers,
  mockDurationMsFor,
  mockTestKind,
  mockAttemptId,
  mockHistoryId,
  parseMockTestDraft,
  splitMockDraft,
  type MockAnswer,
  type MockAttempt,
  type MockAttemptHistoryEntry,
  type MockFinishReason,
  type MockIncident,
  type MockKeyDoc,
  type MockKeystroke,
  type MockOption,
  type MockQuestionsDoc,
  type MockReviewDoc,
  type MockSourcesDoc,
  type MockTestMeta,
} from "./mockTestContent";

const PROGRAM_ID = "project-202";
/** Timer-critical writes must fail visibly instead of queueing while offline. */
const WRITE_TIMEOUT_MS = 12_000;

function services() {
  if (!getCloudConfigurationStatus().configured) throw new CloudClientError("configuration-missing");
  const user = getCurrentCloudUser();
  if (!user) throw new CloudClientError("authentication-required");
  return { firestore: getCloudFirestore(), user };
}

function ref(firestore: Firestore, collectionName: string, id: string) {
  return doc(firestore, "programs", PROGRAM_ID, collectionName, id);
}

function withTimeout<T>(promise: Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new CloudClientError("network-unavailable")), WRITE_TIMEOUT_MS);
    promise.then(
      value => { clearTimeout(timer); resolve(value); },
      error => { clearTimeout(timer); reject(error); },
    );
  });
}

function mapError(error: unknown): CloudClientError {
  if (error instanceof CloudClientError) return error;
  if (error instanceof MockContentError) return new CloudClientError("invalid-tutor-content", error);
  return mapCloudError(error);
}

function millis(value: unknown): number | null {
  if (value instanceof Timestamp) return value.toMillis();
  return null;
}

function parseAttempt(id: string, data: DocumentData): MockAttempt {
  const startedAtMs = millis(data.startedAt);
  if (startedAtMs === null) throw new CloudClientError("invalid-cloud-data");
  // Paper attempts freeze their size and length; module-test attempts never carry them.
  const frozen = typeof data.questionCount === "number" && typeof data.durationSeconds === "number"
    ? { questionCount: data.questionCount, durationSeconds: data.durationSeconds }
    : {};
  const count = frozen.questionCount;
  return {
    id,
    uid: String(data.uid),
    moduleId: String(data.moduleId),
    testVersion: String(data.testVersion),
    attemptNumber: Number(data.attemptNumber),
    status: data.status,
    ...frozen,
    startedAtMs,
    lastSeenAtMs: millis(data.lastSeenAt) ?? startedAtMs,
    answers: Array.isArray(data.answers) ? data.answers : emptyAnswers(count),
    flags: Array.isArray(data.flags) ? data.flags : emptyFlags(count),
    ...(Array.isArray(data.dwellMs) ? { dwellMs: data.dwellMs as number[] } : {}),
    incidents: Array.isArray(data.incidents) ? data.incidents : [],
    keystrokes: Array.isArray(data.keystrokes) ? data.keystrokes : [],
    submittedAtMs: millis(data.submittedAt),
    finishReason: data.finishReason ?? null,
    score: typeof data.score === "number" ? data.score : null,
    correct: Array.isArray(data.correct) ? data.correct : null,
    reviewReleased: data.reviewReleased === true,
    ...(typeof data.firstTryScore === "number" ? { firstTryScore: data.firstTryScore } : {}),
  };
}

// ---------------------------------------------------------------- tests (meta)

export async function getMockTestMeta(moduleId: string): Promise<MockTestMeta | null> {
  try {
    const { firestore } = services();
    const snapshot = await getDoc(ref(firestore, "mockTests", moduleId));
    return snapshot.exists() ? (snapshot.data() as MockTestMeta) : null;
  } catch (error) {
    throw mapError(error);
  }
}

export async function listMockTestMetas(): Promise<MockTestMeta[]> {
  try {
    const { firestore } = services();
    const snapshot = await getDocs(collection(firestore, "programs", PROGRAM_ID, "mockTests"));
    return snapshot.docs.map(item => item.data() as MockTestMeta);
  } catch (error) {
    throw mapError(error);
  }
}

/** Tutor: store an uploaded test as a draft (never visible to the student). */
export async function uploadMockTestDraft(value: unknown): Promise<MockTestMeta> {
  try {
    const draft = parseMockTestDraft(value);
    const { firestore, user } = services();
    const existing = await getDoc(ref(firestore, "mockTests", draft.moduleId));
    if (existing.exists() && (existing.data() as MockTestMeta).status === "published") {
      throw new MockContentError(
        "This module's test is already published. Unpublish it before uploading a new version.",
      );
    }
    const { questions, key, review, sources } = splitMockDraft(draft);
    const questionCount = MOCK_KIND_QUESTION_COUNT[draft.kind];
    const meta: MockTestMeta = {
      schemaVersion: draft.schemaVersion,
      // Schema 1 module tests keep the exact meta shape they always had.
      ...(draft.schemaVersion === MOCK_SCHEMA_VERSION_V2 ? { kind: draft.kind } : {}),
      moduleId: draft.moduleId,
      title: draft.title,
      version: draft.version,
      status: "draft",
      questionCount,
      durationSeconds: mockDurationMsFor(questionCount) / 1000,
      updatedBy: user.uid,
      updatedAtClient: new Date().toISOString(),
      publishedAtClient: null,
    };
    const batch = writeBatch(firestore);
    batch.set(ref(firestore, "mockTests", draft.moduleId), meta);
    batch.set(ref(firestore, "mockTestQuestions", draft.moduleId), questions);
    batch.set(ref(firestore, "mockTestKeys", draft.moduleId), key);
    batch.set(ref(firestore, "mockTestReviews", draft.moduleId), review);
    if (sources) batch.set(ref(firestore, "mockTestSources", draft.moduleId), sources);
    await batch.commit();
    return meta;
  } catch (error) {
    throw mapError(error);
  }
}

export interface MockTestPackage {
  meta: MockTestMeta;
  questions: MockQuestionsDoc;
  key: MockKeyDoc;
  review: MockReviewDoc;
  /** Schema 2 papers: tutor-only provenance. Null for module tests. */
  sources: MockSourcesDoc | null;
}

/** Tutor only: the whole test, for the answer key review and rehearsal. */
export async function loadMockTestPackage(moduleId: string): Promise<MockTestPackage | null> {
  try {
    const { firestore } = services();
    const [meta, questions, key, review] = await Promise.all([
      getDoc(ref(firestore, "mockTests", moduleId)),
      getDoc(ref(firestore, "mockTestQuestions", moduleId)),
      getDoc(ref(firestore, "mockTestKeys", moduleId)),
      getDoc(ref(firestore, "mockTestReviews", moduleId)),
    ]);
    if (!meta.exists() || !questions.exists() || !key.exists() || !review.exists()) return null;
    const metaData = meta.data() as MockTestMeta;
    const sources = metaData.schemaVersion === MOCK_SCHEMA_VERSION_V2
      ? await getDoc(ref(firestore, "mockTestSources", moduleId))
      : null;
    return {
      meta: metaData,
      questions: questions.data() as MockQuestionsDoc,
      key: key.data() as MockKeyDoc,
      review: review.data() as MockReviewDoc,
      sources: sources?.exists() ? (sources.data() as MockSourcesDoc) : null,
    };
  } catch (error) {
    throw mapError(error);
  }
}

/** Tutor: save answer-key and explanation edits while the test is a draft. */
export async function saveMockAnswerKey(
  moduleId: string,
  key: MockKeyDoc,
  review: MockReviewDoc,
): Promise<void> {
  try {
    const { firestore } = services();
    if (!MOCK_KNOWN_QUESTION_COUNTS.includes(key.correct.length) || review.items.length !== key.correct.length) {
      throw new MockContentError("The key and the review must each cover every question of the test.");
    }
    const batch = writeBatch(firestore);
    batch.set(ref(firestore, "mockTestKeys", moduleId), key);
    batch.set(ref(firestore, "mockTestReviews", moduleId), review);
    await batch.commit();
  } catch (error) {
    throw mapError(error);
  }
}

export async function setMockTestPublished(meta: MockTestMeta, published: boolean): Promise<MockTestMeta> {
  try {
    const { firestore, user } = services();
    const now = new Date().toISOString();
    const next: MockTestMeta = {
      ...meta,
      status: published ? "published" : "draft",
      updatedBy: user.uid,
      updatedAtClient: now,
      publishedAtClient: published ? now : null,
    };
    await setDoc(ref(firestore, "mockTests", meta.moduleId), next);
    return next;
  } catch (error) {
    throw mapError(error);
  }
}

// ------------------------------------------------------------ student attempts

export async function getMockQuestions(moduleId: string): Promise<MockQuestionsDoc> {
  try {
    const { firestore } = services();
    const snapshot = await getDoc(ref(firestore, "mockTestQuestions", moduleId));
    if (!snapshot.exists()) throw new CloudClientError("invalid-cloud-data");
    return snapshot.data() as MockQuestionsDoc;
  } catch (error) {
    throw mapError(error);
  }
}

export async function getMockAttempt(uid: string, moduleId: string): Promise<MockAttempt | null> {
  try {
    const { firestore } = services();
    const id = mockAttemptId(uid, moduleId);
    const snapshot = await getDoc(ref(firestore, "mockAttempts", id));
    return snapshot.exists() ? parseAttempt(id, snapshot.data()) : null;
  } catch (error) {
    throw mapError(error);
  }
}

export interface ServerAnchoredAttempt {
  attempt: MockAttempt;
  /** Server clock minus device clock, in milliseconds. */
  serverOffsetMs: number;
}

async function readAnchored(firestore: Firestore, id: string, sentAtMs: number): Promise<ServerAnchoredAttempt> {
  const snapshot = await getDocFromServer(ref(firestore, "mockAttempts", id));
  if (!snapshot.exists()) throw new CloudClientError("invalid-cloud-data");
  const receivedAtMs = Date.now();
  const attempt = parseAttempt(id, snapshot.data());
  // The server stamped lastSeenAt between sending and receiving; use the midpoint.
  const serverOffsetMs = attempt.lastSeenAtMs - (sentAtMs + receivedAtMs) / 2;
  return { attempt, serverOffsetMs };
}

/**
 * The first-try score a new attempt must carry: set when the previous attempt
 * was archived by the student's retake (a module test's final attempt).
 */
async function firstTryScoreFor(firestore: Firestore, id: string, attemptNumber: number): Promise<number | null> {
  if (attemptNumber < 2) return null;
  const previous = await getDoc(ref(firestore, "mockAttemptHistory", mockHistoryId(id, attemptNumber - 1)));
  const data = previous.exists() ? previous.data() : null;
  return data?.archiveReason === "retake" && typeof data.score === "number" ? data.score : null;
}

/**
 * Start an attempt: a first attempt, or a module test's final attempt after
 * the student's retake (it then carries the first-try score). The server
 * stamps the start time. A paper attempt freezes its question count and
 * duration, so a later edit of the paper can never change what it means.
 */
export async function startMockAttempt(meta: MockTestMeta): Promise<ServerAnchoredAttempt> {
  try {
    const { firestore, user } = services();
    const id = mockAttemptId(user.uid, meta.moduleId);
    const counter = await getDoc(ref(firestore, "mockAttemptCounters", id));
    const attemptNumber = counter.exists() ? Number(counter.data().next) : 1;
    const paper = mockTestKind(meta) === "paper";
    const firstTryScore = paper ? null : await firstTryScoreFor(firestore, id, attemptNumber);
    const count = paper ? meta.questionCount : undefined;
    const sentAtMs = Date.now();
    await withTimeout(setDoc(ref(firestore, "mockAttempts", id), {
      uid: user.uid,
      moduleId: meta.moduleId,
      testVersion: meta.version,
      attemptNumber,
      status: "active",
      ...(paper ? { questionCount: meta.questionCount, durationSeconds: meta.durationSeconds, dwellMs: emptyDwell(meta.questionCount) } : {}),
      startedAt: serverTimestamp(),
      lastSeenAt: serverTimestamp(),
      answers: emptyAnswers(count),
      flags: emptyFlags(count),
      incidents: [],
      keystrokes: [],
      submittedAt: null,
      finishReason: null,
      score: null,
      correct: null,
      reviewReleased: false,
      ...(firstTryScore === null ? {} : { firstTryScore }),
    }));
    return await readAnchored(firestore, id, sentAtMs);
  } catch (error) {
    throw mapError(error);
  }
}

/**
 * Learn, then final (module tests only): archive the student's graded first
 * attempt as a "retake" copy, move the counter on and free the slot in one
 * batch, then start the final attempt. If the start fails after the archive,
 * starting again later still creates the final attempt (startMockAttempt
 * reads the retake from history).
 */
export async function startFinalMockAttempt(attempt: MockAttempt, meta: MockTestMeta): Promise<ServerAnchoredAttempt> {
  if (!canStartFinalMockAttempt(attempt)) throw new CloudClientError("invalid-cloud-data");
  try {
    const { firestore, user } = services();
    const current = await getDocFromServer(ref(firestore, "mockAttempts", attempt.id));
    if (current.exists()) {
      const data = current.data();
      const attemptNumber = Number(data.attemptNumber);
      const batch = writeBatch(firestore);
      batch.set(ref(firestore, "mockAttemptHistory", mockHistoryId(attempt.id, attemptNumber)), {
        ...data,
        id: attempt.id,
        archivedAt: serverTimestamp(),
        archivedBy: user.uid,
        archiveReason: "retake",
      });
      batch.set(ref(firestore, "mockAttemptCounters", attempt.id), { next: attemptNumber + 1 });
      batch.delete(ref(firestore, "mockAttempts", attempt.id));
      await withTimeout(batch.commit());
    }
  } catch (error) {
    throw mapError(error);
  }
  return startMockAttempt(meta);
}

/**
 * Re-anchor the clock after a reload. Fails with permission-denied once the
 * deadline has passed, which the caller treats as "finalize as expired".
 */
export async function resumeMockAttempt(attempt: MockAttempt): Promise<ServerAnchoredAttempt> {
  try {
    const { firestore } = services();
    const sentAtMs = Date.now();
    await withTimeout(updateDoc(ref(firestore, "mockAttempts", attempt.id), { lastSeenAt: serverTimestamp() }));
    return await readAnchored(firestore, attempt.id, sentAtMs);
  } catch (error) {
    throw mapError(error);
  }
}

export interface MockWork {
  answers: MockAnswer[];
  flags: boolean[];
  incidents: MockIncident[];
  keystrokes: MockKeystroke[];
  /** Paper attempts only. */
  dwellMs?: number[];
}

/** Firestore rejects undefined fields, and module-test attempts have no dwell. */
function workFields(work: MockWork) {
  const { dwellMs, ...rest } = work;
  return dwellMs ? { ...rest, dwellMs } : rest;
}

export async function saveMockWork(attemptId: string, work: MockWork): Promise<void> {
  try {
    const { firestore } = services();
    await withTimeout(updateDoc(ref(firestore, "mockAttempts", attemptId), {
      ...workFields(work),
      lastSeenAt: serverTimestamp(),
    }));
  } catch (error) {
    throw mapError(error);
  }
}

/** Submit, time out, or forfeit (Leave Test) before the deadline. */
export async function finishMockAttempt(
  attemptId: string,
  work: MockWork,
  reason: Exclude<MockFinishReason, "expired">,
): Promise<void> {
  try {
    const { firestore } = services();
    await withTimeout(updateDoc(ref(firestore, "mockAttempts", attemptId), {
      ...workFields(work),
      status: reason === "leave" ? "forfeited" : "submitted",
      finishReason: reason,
      submittedAt: serverTimestamp(),
      lastSeenAt: serverTimestamp(),
    }));
  } catch (error) {
    throw mapError(error);
  }
}

/** After the deadline: lock the attempt with the answers already saved. */
export async function finalizeExpiredMockAttempt(attemptId: string): Promise<void> {
  try {
    const { firestore } = services();
    await withTimeout(updateDoc(ref(firestore, "mockAttempts", attemptId), {
      status: "submitted",
      finishReason: "expired",
      submittedAt: serverTimestamp(),
      lastSeenAt: serverTimestamp(),
    }));
  } catch (error) {
    throw mapError(error);
  }
}

/**
 * Grade a locked attempt. The key becomes readable only now, and the rules
 * accept the score only if it equals the key applied to the frozen answers.
 */
export async function gradeMockAttempt(attempt: MockAttempt): Promise<MockAttempt> {
  try {
    if (attempt.score !== null) return attempt;
    const { firestore } = services();
    const key = await getDoc(ref(firestore, "mockTestKeys", attempt.moduleId));
    if (!key.exists()) throw new CloudClientError("invalid-cloud-data");
    const { correct, score } = gradeMockAnswers(attempt.answers, (key.data() as MockKeyDoc).correct);
    await withTimeout(updateDoc(ref(firestore, "mockAttempts", attempt.id), { score, correct }));
    return { ...attempt, score, correct };
  } catch (error) {
    throw mapError(error);
  }
}

/** The whole key document, including a paper's per-question tags (readable once locked). */
export async function getMockKeyDoc(moduleId: string): Promise<MockKeyDoc> {
  try {
    const { firestore } = services();
    const snapshot = await getDoc(ref(firestore, "mockTestKeys", moduleId));
    if (!snapshot.exists()) throw new CloudClientError("invalid-cloud-data");
    return snapshot.data() as MockKeyDoc;
  } catch (error) {
    throw mapError(error);
  }
}

/**
 * Tutor: follow one attempt while it is in progress (answered count, last
 * seen, incidents). Used only for an active paper, so the app stays light.
 */
export function watchMockAttempt(attemptId: string, onChange: (attempt: MockAttempt | null) => void): () => void {
  try {
    const { firestore } = services();
    return onSnapshot(
      ref(firestore, "mockAttempts", attemptId),
      snapshot => onChange(snapshot.exists() ? parseAttempt(snapshot.id, snapshot.data()) : null),
      () => onChange(null),
    );
  } catch {
    return () => undefined;
  }
}

export async function getMockAnswerKey(moduleId: string): Promise<MockOption[]> {
  try {
    const { firestore } = services();
    const snapshot = await getDoc(ref(firestore, "mockTestKeys", moduleId));
    if (!snapshot.exists()) throw new CloudClientError("invalid-cloud-data");
    return (snapshot.data() as MockKeyDoc).correct;
  } catch (error) {
    throw mapError(error);
  }
}

/** Tutor only: private provenance and tags of a schema 2 paper. */
export async function getMockSources(moduleId: string): Promise<MockSourcesDoc | null> {
  try {
    const { firestore } = services();
    const snapshot = await getDoc(ref(firestore, "mockTestSources", moduleId));
    return snapshot.exists() ? (snapshot.data() as MockSourcesDoc) : null;
  } catch (error) {
    throw mapError(error);
  }
}

export async function getMockReview(moduleId: string): Promise<MockReviewDoc> {
  try {
    const { firestore } = services();
    const snapshot = await getDoc(ref(firestore, "mockTestReviews", moduleId));
    if (!snapshot.exists()) throw new CloudClientError("invalid-cloud-data");
    return snapshot.data() as MockReviewDoc;
  } catch (error) {
    throw mapError(error);
  }
}

// ---------------------------------------------------------------- tutor tools

export async function listMockAttempts(): Promise<MockAttempt[]> {
  try {
    const { firestore } = services();
    const snapshot = await getDocs(collection(firestore, "programs", PROGRAM_ID, "mockAttempts"));
    return snapshot.docs.map(item => parseAttempt(item.id, item.data()));
  } catch (error) {
    throw mapError(error);
  }
}

export async function listMockAttemptHistory(): Promise<MockAttemptHistoryEntry[]> {
  try {
    const { firestore } = services();
    const snapshot = await getDocs(collection(firestore, "programs", PROGRAM_ID, "mockAttemptHistory"));
    return snapshot.docs.map(item => {
      const data = item.data();
      return {
        ...parseAttempt(String(data.id), data),
        archivedAtMs: millis(data.archivedAt) ?? 0,
        archivedBy: String(data.archivedBy ?? ""),
        ...(data.archiveReason === "retake" ? { archiveReason: "retake" as const } : {}),
      };
    });
  } catch (error) {
    throw mapError(error);
  }
}

/** Tutor grading fallback, e.g. when the student went offline after submitting. */
export async function tutorGradeMockAttempt(attempt: MockAttempt): Promise<MockAttempt> {
  try {
    const { firestore } = services();
    const key = await getDoc(ref(firestore, "mockTestKeys", attempt.moduleId));
    if (!key.exists()) throw new CloudClientError("invalid-cloud-data");
    const { correct, score } = gradeMockAnswers(attempt.answers, (key.data() as MockKeyDoc).correct);
    await updateDoc(ref(firestore, "mockAttempts", attempt.id), { score, correct });
    return { ...attempt, score, correct };
  } catch (error) {
    throw mapError(error);
  }
}

/**
 * Reset a student's attempt: archive it, bump the attempt counter and delete
 * the current document, in one batch. The rules refuse the delete unless the
 * archive exists after the batch, so no attempt can disappear unrecorded.
 */
export async function resetMockAttempt(attemptId: string): Promise<void> {
  try {
    const { firestore, user } = services();
    const current = await getDocFromServer(ref(firestore, "mockAttempts", attemptId));
    if (!current.exists()) return;
    const data = current.data();
    const attemptNumber = Number(data.attemptNumber);
    const batch = writeBatch(firestore);
    batch.set(ref(firestore, "mockAttemptHistory", mockHistoryId(attemptId, attemptNumber)), {
      ...data,
      id: attemptId,
      archivedAt: serverTimestamp(),
      archivedBy: user.uid,
    });
    batch.set(ref(firestore, "mockAttemptCounters", attemptId), { next: attemptNumber + 1 });
    batch.delete(ref(firestore, "mockAttempts", attemptId));
    await batch.commit();
  } catch (error) {
    throw mapError(error);
  }
}

// Exported for unit tests of the Firestore mapping.
export const parseMockAttemptSnapshot = parseAttempt;
