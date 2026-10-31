/**
 * Executable permission suite for module mock tests, full papers and tutor
 * rehearsals, run only against the local Auth/Firestore emulators with a
 * `demo-` project:
 *
 *   npm run test:materials:emulator
 *
 * Synthetic accounts and a synthetic 45-question paper exercise firestore.rules
 * through the real Firebase SDK. It refuses to run otherwise, so it can never
 * reach the live project.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { deleteApp, initializeApp, type FirebaseApp } from "firebase/app";
import { connectAuthEmulator, createUserWithEmailAndPassword, getAuth } from "firebase/auth";
import {
  collection, connectFirestoreEmulator, deleteDoc, doc, getDoc, getDocFromServer, getDocs, getFirestore,
  query, serverTimestamp, setDoc, terminate, updateDoc, where, writeBatch, type Firestore,
} from "firebase/firestore";
import {
  MOCK_KIND_QUESTION_COUNT,
  emptyAnswers,
  emptyDwell,
  emptyFlags,
  gradeMockAnswers,
  mockDocBytes,
  mockDurationMsFor,
  parseMockTestDraft,
  splitMockDraft,
  type MockKeystroke,
  type MockOption,
  type MockTestDraft,
} from "./mockTestContent";
import { syntheticPaper, syntheticTopicPaper } from "../testFixtures/syntheticPaper";

const PROJECT = process.env.GCLOUD_PROJECT ?? "";
const FIRESTORE_HOST = process.env.FIRESTORE_EMULATOR_HOST ?? "";
const AUTH_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST ?? "";

// Fail closed: every endpoint must be an emulator of a demo project.
if (!PROJECT.startsWith("demo-") || !FIRESTORE_HOST || !AUTH_HOST) {
  throw new Error(
    "Emulator suite refused to start: run it through `npm run test:materials:emulator` " +
      "(demo- project with Auth and Firestore emulators).",
  );
}

const ROOT = "programs/project-202";
const DENIED = /permission-denied|unauthorized|unauthenticated/;
const PAPER = "qm-paper-01";
const MODULE = "m99-synthetic-module";

interface Actor {
  name: string;
  app: FirebaseApp;
  firestore: Firestore;
  uid: string;
}

const apps: FirebaseApp[] = [];
let counter = 0;

function hostPort(value: string): [string, number] {
  const [host, port] = value.split(":");
  return [host!, Number(port)];
}

async function actor(name: string): Promise<Actor> {
  const app = initializeApp({ apiKey: "demo-api-key", projectId: PROJECT, appId: "demo-app" }, `${name}-${++counter}`);
  apps.push(app);
  const auth = getAuth(app);
  connectAuthEmulator(auth, `http://${AUTH_HOST}`, { disableWarnings: true });
  const firestore = getFirestore(app);
  connectFirestoreEmulator(firestore, ...hostPort(FIRESTORE_HOST));
  const credential = await createUserWithEmailAndPassword(auth, `mock-${name}-${counter}@synthetic.test`, "synthetic-password-1");
  return { name, app, firestore, uid: credential.user.uid };
}

/** Writes as the emulator owner (bypasses rules): seeding only. */
async function ownerPatch(path: string, fields: Record<string, unknown>, mask?: string[]) {
  const params = mask ? `?${mask.map(field => `updateMask.fieldPaths=${field}`).join("&")}` : "";
  const response = await fetch(
    `http://${FIRESTORE_HOST}/v1/projects/${PROJECT}/databases/(default)/documents/${path}${params}`,
    { method: "PATCH", headers: { Authorization: "Bearer owner", "Content-Type": "application/json" }, body: JSON.stringify({ fields }) },
  );
  if (!response.ok) throw new Error(`Owner write failed: ${response.status} ${await response.text()}`);
}

async function seedMember(uid: string, role: string) {
  await ownerPatch(`${ROOT}/members/${uid}`, { active: { booleanValue: true }, role: { stringValue: role } });
}

/** Moves an attempt's server start time into the past, as if minutes had elapsed. */
async function backdateStart(attemptId: string, minutesAgo: number) {
  const at = new Date(Date.now() - minutesAgo * 60_000).toISOString();
  await ownerPatch(`${ROOT}/mockAttempts/${attemptId}`, { startedAt: { timestampValue: at } }, ["startedAt"]);
}

async function expectDenied(work: Promise<unknown>) {
  let error: unknown = null;
  try {
    await work;
  } catch (caught) {
    error = caught;
  }
  expect(error, "expected the request to be denied").not.toBeNull();
  expect(String((error as { code?: string }).code)).toMatch(DENIED);
}

const ref = (who: Actor, collectionName: string, id: string) => doc(who.firestore, "programs", "project-202", collectionName, id);

function syntheticModuleDraft(moduleId = MODULE): MockTestDraft {
  return parseMockTestDraft({
    schemaVersion: 1,
    moduleId,
    version: "module-v1",
    title: "Synthetic module test",
    source: "emulator fixture",
    questions: Array.from({ length: 8 }, (_, index) => ({
      id: `syn-q${index + 1}`,
      stem: `Synthetic stem ${index + 1}`,
      table: null,
      options: ["Alpha.", "Beta.", "Gamma."],
      correctOption: index % 3,
      concept: "Synthetic concept",
      explanation: "Synthetic explanation",
      distractors: ["a", "b", "c"],
      confidence: "High",
    })),
  });
}

/** The same batch the tutor upload writes (cloudMockTests.uploadMockTestDraft). */
function uploadBatch(who: Actor, draft: MockTestDraft, status: "draft" | "published" = "draft") {
  const docs = splitMockDraft(draft);
  const count = MOCK_KIND_QUESTION_COUNT[draft.kind];
  const batch = writeBatch(who.firestore);
  batch.set(ref(who, "mockTests", draft.moduleId), {
    schemaVersion: draft.schemaVersion,
    ...(draft.schemaVersion === 2 ? { kind: draft.kind } : {}),
    moduleId: draft.moduleId,
    title: draft.title,
    version: draft.version,
    status,
    questionCount: count,
    durationSeconds: mockDurationMsFor(count) / 1000,
    updatedBy: who.uid,
    updatedAtClient: new Date().toISOString(),
    publishedAtClient: null,
  });
  batch.set(ref(who, "mockTestQuestions", draft.moduleId), docs.questions);
  batch.set(ref(who, "mockTestKeys", draft.moduleId), docs.key);
  batch.set(ref(who, "mockTestReviews", draft.moduleId), docs.review);
  if (docs.sources) batch.set(ref(who, "mockTestSources", draft.moduleId), docs.sources);
  return batch;
}

async function publish(who: Actor, testId: string) {
  const meta = (await getDocFromServer(ref(who, "mockTests", testId))).data()!;
  await setDoc(ref(who, "mockTests", testId), { ...meta, status: "published", updatedBy: who.uid, publishedAtClient: new Date().toISOString() });
}

function newAttempt(who: Actor, testId: string, version: string, count: number, frozen: boolean) {
  return {
    uid: who.uid,
    moduleId: testId,
    testVersion: version,
    attemptNumber: 1,
    status: "active",
    ...(frozen ? { questionCount: count, durationSeconds: mockDurationMsFor(count) / 1000, dwellMs: emptyDwell(count) } : {}),
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
  };
}

function strokes(count: number): MockKeystroke[] {
  const registers = { N: 0, IY: 0, PV: 0, PMT: 0, FV: 0, PY: 1, CY: 1, isBGN: false };
  return Array.from({ length: count }, (_, index) => ({ q: index % 45, key: "1", display: "1", t: index, registers }));
}

let tutor: Actor;
let secondTutor: Actor;
let student: Actor;
let otherStudent: Actor;
let paper: MockTestDraft;
let paperKey: MockOption[];

beforeAll(async () => {
  [tutor, secondTutor, student, otherStudent] = await Promise.all([
    actor("tutor"), actor("second-tutor"), actor("student"), actor("other-student"),
  ]);
  await seedMember(tutor.uid, "tutor");
  await seedMember(secondTutor.uid, "tutor");
  await seedMember(student.uid, "student");
  await seedMember(otherStudent.uid, "student");
  paper = parseMockTestDraft(syntheticPaper());
  paperKey = splitMockDraft(paper).key.correct;
});

afterAll(async () => {
  for (const app of apps) {
    await terminate(getFirestore(app)).catch(() => undefined);
    await deleteApp(app).catch(() => undefined);
  }
});

describe("mock test and paper rules (emulator)", () => {
  it("lets the tutor upload a 45-question paper draft with tags and tutor-only sources", async () => {
    await uploadBatch(tutor, paper).commit();
    const key = (await getDocFromServer(ref(tutor, "mockTestKeys", PAPER))).data()!;
    expect(key.modules).toHaveLength(45);
    expect((await getDocFromServer(ref(tutor, "mockTestSources", PAPER))).data()!.items).toHaveLength(45);
  });

  it("rejects paper metadata with a wrong count, duration or schema", async () => {
    const meta = (await getDocFromServer(ref(tutor, "mockTests", PAPER))).data()!;
    await expectDenied(setDoc(ref(tutor, "mockTests", PAPER), { ...meta, durationSeconds: 720 }));
    await expectDenied(setDoc(ref(tutor, "mockTests", PAPER), { ...meta, questionCount: 8, durationSeconds: 720 }));
    await expectDenied(setDoc(ref(tutor, "mockTests", PAPER), { ...meta, schemaVersion: 1 }));
    await expectDenied(setDoc(ref(tutor, "mockTests", PAPER), { ...meta, questionCount: 20, durationSeconds: 1800 }));
  });

  it("rejects paper content lists that do not cover all 45 questions", async () => {
    const docs = splitMockDraft(paper);
    await expectDenied(setDoc(ref(tutor, "mockTestKeys", PAPER), { ...docs.key, correct: docs.key.correct.slice(0, 8) }));
    await expectDenied(setDoc(ref(tutor, "mockTestKeys", PAPER), { ...docs.key, modules: docs.key.modules!.slice(0, 43) }));
    await expectDenied(setDoc(ref(tutor, "mockTestQuestions", PAPER), { ...docs.questions, questions: docs.questions.questions.slice(0, 8) }));
  });

  it("keeps drafts and sources away from students", async () => {
    await expectDenied(getDocFromServer(ref(student, "mockTests", PAPER)));
    await expectDenied(getDocFromServer(ref(student, "mockTestQuestions", PAPER)));
    await expectDenied(getDocFromServer(ref(student, "mockTestSources", PAPER)));
    await expectDenied(setDoc(ref(student, "mockTests", PAPER), { status: "published" }));
  });

  it("accepts a realistic 45-question paper near the document budget", async () => {
    // Another topic's paper (Ethics), so the QM paper used below stays untouched.
    const heavy = parseMockTestDraft(syntheticTopicPaper("eth-paper-01", {
      questions: syntheticTopicPaper("eth-paper-01").questions.map(question => ({
        ...question,
        stem: "s".repeat(1500),
        explanation: "x".repeat(4000),
        working: Array(12).fill("y".repeat(600)),
        distractors: ["z".repeat(1200), "z".repeat(1200), "z".repeat(1200)],
      })),
    }));
    const docs = splitMockDraft(heavy);
    expect(mockDocBytes(docs.review)).toBeGreaterThan(600_000);
    await uploadBatch(tutor, heavy).commit();
  });

  it("starts a paper attempt only with the frozen 45-question, 67.5-minute shape", async () => {
    await publish(tutor, PAPER);
    const id = `${student.uid}_${PAPER}`;
    await expectDenied(setDoc(ref(student, "mockAttempts", id), newAttempt(student, PAPER, paper.version, 8, false)));
    await expectDenied(setDoc(ref(student, "mockAttempts", id), { ...newAttempt(student, PAPER, paper.version, 45, true), durationSeconds: 720 }));
    await expectDenied(setDoc(ref(student, "mockAttempts", id), { ...newAttempt(student, PAPER, paper.version, 45, true), dwellMs: Array(45).fill(5) }));
    await setDoc(ref(student, "mockAttempts", id), newAttempt(student, PAPER, paper.version, 45, true));
    expect((await getDocFromServer(ref(student, "mockTestQuestions", PAPER))).data()!.questions).toHaveLength(45);
    await expectDenied(getDocFromServer(ref(student, "mockTestKeys", PAPER)));
    await expectDenied(getDocFromServer(ref(student, "mockTestSources", PAPER)));
  });

  it("validates paper saves: answers, flags, dwell and a 1,500-keystroke log", async () => {
    const id = `${student.uid}_${PAPER}`;
    const answers = paperKey.map((right, index) => (index < 40 ? right : null));
    const save = (fields: Record<string, unknown>) => updateDoc(ref(student, "mockAttempts", id), { ...fields, lastSeenAt: serverTimestamp() });
    await save({ answers, flags: emptyFlags(45), dwellMs: Array(45).fill(1000), keystrokes: strokes(1200) });
    await expectDenied(save({ answers: [...answers.slice(0, 43), 3] }));
    await expectDenied(save({ answers: answers.slice(0, 43) }));
    await expectDenied(save({ dwellMs: Array(8).fill(0) }));
    // The heaviest legitimate save: the full 1,500-keystroke log, every answer and every flag set.
    await save({ answers: paperKey, flags: Array(45).fill(true), dwellMs: Array(45).fill(90_000), keystrokes: strokes(1500) });
    await save({ answers, flags: emptyFlags(45), dwellMs: Array(45).fill(1000) });
    await expectDenied(save({ keystrokes: strokes(1501) }));
    await expectDenied(save({ keystrokes: strokes(1499) }));
  });

  it("keeps a paper open after 13 minutes and closes it after 67.5", async () => {
    const id = `${student.uid}_${PAPER}`;
    const save = () => updateDoc(ref(student, "mockAttempts", id), { flags: emptyFlags(45).map((_, i) => i === 0), lastSeenAt: serverTimestamp() });
    await backdateStart(id, 13);
    await save();
    await backdateStart(id, 69);
    await expectDenied(save());
    await expectDenied(updateDoc(ref(student, "mockAttempts", id), {
      status: "submitted", finishReason: "submit", submittedAt: serverTimestamp(), lastSeenAt: serverTimestamp(),
    }));
    await updateDoc(ref(student, "mockAttempts", id), {
      status: "submitted", finishReason: "expired", submittedAt: serverTimestamp(), lastSeenAt: serverTimestamp(),
    });
  });

  it("grades a locked paper only with the key applied to all 45 frozen answers", async () => {
    const id = `${student.uid}_${PAPER}`;
    const attempt = (await getDocFromServer(ref(student, "mockAttempts", id))).data()!;
    const key = (await getDocFromServer(ref(student, "mockTestKeys", PAPER))).data()!;
    const graded = gradeMockAnswers(attempt.answers, key.correct);
    expect(graded.score).toBe(40);
    await expectDenied(updateDoc(ref(student, "mockAttempts", id), { score: 45, correct: Array(45).fill(true) }));
    const forgedLast = [...graded.correct.slice(0, 44), !graded.correct[44]];
    await expectDenied(updateDoc(ref(student, "mockAttempts", id), { score: graded.score, correct: forgedLast }));
    await expectDenied(updateDoc(ref(student, "mockAttempts", id), { score: graded.score + 1, correct: graded.correct }));
    await expectDenied(updateDoc(ref(student, "mockAttempts", id), { score: graded.score, correct: graded.correct.slice(0, 8) }));
    await updateDoc(ref(student, "mockAttempts", id), { score: graded.score, correct: graded.correct });
    expect(key.modules).toHaveLength(45);
    // The review opens with the lock, without any tutor release; sources never do.
    expect((await getDocFromServer(ref(student, "mockAttempts", id))).data()!.reviewReleased).toBe(false);
    expect((await getDocFromServer(ref(student, "mockTestReviews", PAPER))).data()!.items).toHaveLength(45);
    await expectDenied(getDocFromServer(ref(student, "mockTestSources", PAPER)));
  });

  it("keeps eight-question module tests exactly as before", async () => {
    const draft = syntheticModuleDraft();
    await uploadBatch(tutor, draft).commit();
    await publish(tutor, MODULE);
    const id = `${otherStudent.uid}_${MODULE}`;
    await expectDenied(setDoc(ref(otherStudent, "mockAttempts", id), newAttempt(otherStudent, MODULE, draft.version, 45, true)));
    await expectDenied(setDoc(ref(otherStudent, "mockAttempts", id), newAttempt(otherStudent, MODULE, draft.version, 8, true)));
    await setDoc(ref(otherStudent, "mockAttempts", id), newAttempt(otherStudent, MODULE, draft.version, 8, false));
    const save = (fields: Record<string, unknown>) => updateDoc(ref(otherStudent, "mockAttempts", id), { ...fields, lastSeenAt: serverTimestamp() });
    await save({ answers: [0, 1, 2, 0, null, null, null, null], keystrokes: strokes(600) });
    await expectDenied(save({ keystrokes: strokes(601) }));
    await expectDenied(save({ dwellMs: Array(8).fill(0) }));
    await expectDenied(save({ answers: emptyAnswers(45) }));
    await backdateStart(id, 11);
    await save({ flags: [true, false, false, false, false, false, false, false] });
    await backdateStart(id, 13);
    await expectDenied(save({ flags: emptyFlags() }));
    await updateDoc(ref(otherStudent, "mockAttempts", id), {
      status: "submitted", finishReason: "expired", submittedAt: serverTimestamp(), lastSeenAt: serverTimestamp(),
    });
    const key = (await getDocFromServer(ref(otherStudent, "mockTestKeys", MODULE))).data()!;
    const graded = gradeMockAnswers([0, 1, 2, 0, null, null, null, null], key.correct);
    await expectDenied(updateDoc(ref(otherStudent, "mockAttempts", id), { score: 8, correct: Array(8).fill(true) }));
    await updateDoc(ref(otherStudent, "mockAttempts", id), { score: graded.score, correct: graded.correct });
  });

  it("still runs and grades a paper uploaded with 44 questions", async () => {
    const LEGACY = "legacy-paper-44";
    const docs = splitMockDraft(paper);
    const trim = <T,>(list: T[]) => list.slice(0, 44);
    const batch = writeBatch(tutor.firestore);
    batch.set(ref(tutor, "mockTests", LEGACY), {
      schemaVersion: 2, kind: "paper", moduleId: LEGACY, title: "Legacy", version: paper.version, status: "draft",
      questionCount: 44, durationSeconds: 3960, updatedBy: tutor.uid, updatedAtClient: "", publishedAtClient: null,
    });
    // Content is written while the paper is a draft, then published.
    batch.set(ref(tutor, "mockTestQuestions", LEGACY), { moduleId: LEGACY, version: paper.version, questions: trim(docs.questions.questions) });
    batch.set(ref(tutor, "mockTestKeys", LEGACY), { moduleId: LEGACY, version: paper.version, correct: trim(docs.key.correct) });
    batch.set(ref(tutor, "mockTestReviews", LEGACY), { moduleId: LEGACY, version: paper.version, items: trim(docs.review.items) });
    await batch.commit();
    await publish(tutor, LEGACY);
    const id = `${otherStudent.uid}_${LEGACY}`;
    await setDoc(ref(otherStudent, "mockAttempts", id), newAttempt(otherStudent, LEGACY, paper.version, 44, true));
    const key = trim(paperKey);
    await updateDoc(ref(otherStudent, "mockAttempts", id), {
      answers: key, flags: emptyFlags(44), dwellMs: emptyDwell(44), keystrokes: strokes(1500),
      status: "submitted", finishReason: "submit", submittedAt: serverTimestamp(), lastSeenAt: serverTimestamp(),
    });
    const graded = gradeMockAnswers(key, key);
    await expectDenied(updateDoc(ref(otherStudent, "mockAttempts", id), { score: 45, correct: Array(45).fill(true) }));
    await updateDoc(ref(otherStudent, "mockAttempts", id), { score: graded.score, correct: graded.correct });
    expect((await getDocFromServer(ref(otherStudent, "mockAttempts", id))).data()!.score).toBe(44);
  });

  it("archives and resets a paper attempt with its frozen shape", async () => {
    const id = `${student.uid}_${PAPER}`;
    const current = (await getDocFromServer(ref(tutor, "mockAttempts", id))).data()!;
    const batch = writeBatch(tutor.firestore);
    batch.set(ref(tutor, "mockAttemptHistory", `${id}_1`), { ...current, id, archivedAt: serverTimestamp(), archivedBy: tutor.uid });
    batch.set(ref(tutor, "mockAttemptCounters", id), { next: 2 });
    batch.delete(ref(tutor, "mockAttempts", id));
    await batch.commit();
    const archived = (await getDocFromServer(ref(student, "mockAttemptHistory", `${id}_1`))).data()!;
    expect(archived.questionCount).toBe(45);
    expect(archived.durationSeconds).toBe(4050);
    await setDoc(ref(student, "mockAttempts", id), { ...newAttempt(student, PAPER, paper.version, 45, true), attemptNumber: 2 });

    // The heaviest legitimate submit and grade: all answers, full keystroke log, in time.
    await updateDoc(ref(student, "mockAttempts", id), {
      answers: paperKey, flags: Array(45).fill(true), dwellMs: Array(45).fill(60_000), keystrokes: strokes(1500),
      status: "submitted", finishReason: "submit", submittedAt: serverTimestamp(), lastSeenAt: serverTimestamp(),
    });
    const graded = gradeMockAnswers(paperKey, paperKey);
    await updateDoc(ref(student, "mockAttempts", id), { score: graded.score, correct: graded.correct });
    expect((await getDocFromServer(ref(student, "mockAttempts", id))).data()!.score).toBe(45);
  });
});

describe("module tests: learn, then final (emulator)", () => {
  const RETAKE = "m98-retake-module";
  let draft: MockTestDraft;
  let key: MockOption[];
  let id: string;

  /** The student's retake batch (cloudMockTests.startFinalMockAttempt), with parts that can be left out or tampered with. */
  function retake(
    who: Actor,
    attemptId: string,
    current: Record<string, unknown>,
    options: { overrides?: Record<string, unknown>; counter?: boolean; remove?: boolean; reason?: boolean } = {},
  ) {
    const n = current.attemptNumber as number;
    const batch = writeBatch(who.firestore);
    batch.set(ref(who, "mockAttemptHistory", `${attemptId}_${n}`), {
      ...current, id: attemptId, archivedAt: serverTimestamp(), archivedBy: who.uid,
      ...(options.reason === false ? {} : { archiveReason: "retake" }),
      ...options.overrides,
    });
    if (options.counter !== false) batch.set(ref(who, "mockAttemptCounters", attemptId), { next: n + 1 });
    if (options.remove !== false) batch.delete(ref(who, "mockAttempts", attemptId));
    return batch.commit();
  }

  const live = async () => (await getDocFromServer(ref(student, "mockAttempts", id))).data()!;
  const submit = (answers: (MockOption | null)[]) => updateDoc(ref(student, "mockAttempts", id), {
    answers, status: "submitted", finishReason: "submit", submittedAt: serverTimestamp(), lastSeenAt: serverTimestamp(),
  });
  const grade = async () => {
    const graded = gradeMockAnswers((await live()).answers, key);
    await updateDoc(ref(student, "mockAttempts", id), { score: graded.score, correct: graded.correct });
    return graded.score;
  };

  beforeAll(async () => {
    draft = syntheticModuleDraft(RETAKE);
    key = splitMockDraft(draft).key.correct;
    await uploadBatch(tutor, draft).commit();
    await publish(tutor, RETAKE);
    id = `${student.uid}_${RETAKE}`;
  });

  it("starts a plain first attempt; a first attempt can never claim a first-try score", async () => {
    await expectDenied(setDoc(ref(student, "mockAttempts", id), { ...newAttempt(student, RETAKE, draft.version, 8, false), firstTryScore: 8 }));
    await setDoc(ref(student, "mockAttempts", id), newAttempt(student, RETAKE, draft.version, 8, false));
    await expectDenied(getDocFromServer(ref(student, "mockTestKeys", RETAKE)));
    await expectDenied(getDocFromServer(ref(student, "mockTestReviews", RETAKE)));
    await expectDenied(retake(student, id, await live()));
  });

  it("refuses a retake before grading, then opens the review as soon as the attempt is locked", async () => {
    // Five of eight right.
    await submit(key.map((option, index) => (index < 5 ? option : ((option + 1) % 3) as MockOption)));
    await expectDenied(retake(student, id, await live()));
    expect(await grade()).toBe(5);
    expect((await getDocFromServer(ref(student, "mockTestReviews", RETAKE))).data()!.items).toHaveLength(8);
    expect((await getDocFromServer(ref(student, "mockTestKeys", RETAKE))).data()!.correct).toEqual(key);
  });

  it("refuses a forged, partial or foreign retake", async () => {
    const current = await live();
    // The copy must be exact: no better score, no changed answers.
    await expectDenied(retake(student, id, current, { overrides: { score: 8 } }));
    await expectDenied(retake(student, id, current, { overrides: { answers: key } }));
    await expectDenied(retake(student, id, current, { overrides: { archivedBy: tutor.uid } }));
    // All three writes, together.
    await expectDenied(retake(student, id, current, { remove: false }));
    await expectDenied(retake(student, id, current, { counter: false, remove: false }));
    await expectDenied(retake(student, id, current, { overrides: {}, counter: true, remove: true, reason: false }));
    // The counter may only move to the next number.
    const skip = writeBatch(student.firestore);
    skip.set(ref(student, "mockAttemptHistory", `${id}_1`), { ...current, id, archivedAt: serverTimestamp(), archivedBy: student.uid, archiveReason: "retake" });
    skip.set(ref(student, "mockAttemptCounters", id), { next: 5 });
    skip.delete(ref(student, "mockAttempts", id));
    await expectDenied(skip.commit());
    // Nobody else can retake the student's attempt.
    await expectDenied(retake(otherStudent, id, current));
    expect((await live()).score).toBe(5);
  });

  it("retakes, then starts the final attempt only with the archived first-try score", async () => {
    await retake(student, id, await live());
    const archived = (await getDocFromServer(ref(student, "mockAttemptHistory", `${id}_1`))).data()!;
    expect(archived.archiveReason).toBe("retake");
    expect(archived.score).toBe(5);
    expect((await getDocFromServer(ref(student, "mockAttempts", id))).exists()).toBe(false);
    const final = { ...newAttempt(student, RETAKE, draft.version, 8, false), attemptNumber: 2 };
    await expectDenied(setDoc(ref(student, "mockAttempts", id), final));
    await expectDenied(setDoc(ref(student, "mockAttempts", id), { ...final, firstTryScore: 8 }));
    await setDoc(ref(student, "mockAttempts", id), { ...final, firstTryScore: 5 });
    // While the final runs, the key and the review are closed again.
    await expectDenied(getDocFromServer(ref(student, "mockTestKeys", RETAKE)));
    await expectDenied(getDocFromServer(ref(student, "mockTestReviews", RETAKE)));
    // The first-try score cannot be edited.
    await expectDenied(updateDoc(ref(student, "mockAttempts", id), { firstTryScore: 8, lastSeenAt: serverTimestamp() }));
    await expectDenied(updateDoc(ref(tutor, "mockAttempts", id), { firstTryScore: 8 }));
  });

  it("never retakes a final attempt", async () => {
    await submit(key);
    expect(await grade()).toBe(8);
    const final = await live();
    expect(final.firstTryScore).toBe(5);
    await expectDenied(retake(student, id, final));
    expect((await getDocFromServer(ref(student, "mockTestReviews", RETAKE))).exists()).toBe(true);
  });

  it("never retakes a paper", async () => {
    const paperId = `${otherStudent.uid}_legacy-paper-44`;
    const paperAttempt = (await getDocFromServer(ref(otherStudent, "mockAttempts", paperId))).data()!;
    expect(paperAttempt.score).toBe(44);
    await expectDenied(retake(otherStudent, paperId, paperAttempt));
  });

  it("starts a new first attempt after a tutor reset of the final; a reset cannot pose as a retake", async () => {
    const final = await live();
    const pose = writeBatch(tutor.firestore);
    pose.set(ref(tutor, "mockAttemptHistory", `${id}_2`), { ...final, id, archivedAt: serverTimestamp(), archivedBy: tutor.uid, archiveReason: "retake" });
    pose.set(ref(tutor, "mockAttemptCounters", id), { next: 3 });
    pose.delete(ref(tutor, "mockAttempts", id));
    await expectDenied(pose.commit());
    const reset = writeBatch(tutor.firestore);
    reset.set(ref(tutor, "mockAttemptHistory", `${id}_2`), { ...final, id, archivedAt: serverTimestamp(), archivedBy: tutor.uid });
    reset.set(ref(tutor, "mockAttemptCounters", id), { next: 3 });
    reset.delete(ref(tutor, "mockAttempts", id));
    await reset.commit();
    const next = { ...newAttempt(student, RETAKE, draft.version, 8, false), attemptNumber: 3 };
    await expectDenied(setDoc(ref(student, "mockAttempts", id), { ...next, firstTryScore: 8 }));
    await setDoc(ref(student, "mockAttempts", id), next);
  });
});

describe("tutor rehearsals (emulator)", () => {
  const rehearsal = (who: Actor, overrides: Record<string, unknown> = {}) => ({
    uid: who.uid,
    testId: PAPER,
    testVersion: paper.version,
    questionCount: 45,
    durationSeconds: 4050,
    status: "active",
    startedAtMs: 1_700_000_000_000,
    updatedAtMs: 1_700_000_000_000,
    finishedAtMs: null,
    finishReason: null,
    answers: emptyAnswers(45),
    flags: emptyFlags(45),
    dwellMs: emptyDwell(45),
    score: null,
    correct: null,
    ...overrides,
  });
  const rehearsalId = (who: Actor) => `${who.uid}_${PAPER}_1700000000000`;

  it("lets a tutor save, resume, finish and discard their own rehearsal", async () => {
    const id = rehearsalId(tutor);
    await setDoc(ref(tutor, "mockRehearsals", id), rehearsal(tutor));
    await setDoc(ref(tutor, "mockRehearsals", id), rehearsal(tutor, { answers: paperKey, updatedAtMs: 1_700_000_100_000 }));
    const mine = await getDocs(query(
      collection(tutor.firestore, "programs", "project-202", "mockRehearsals"),
      where("uid", "==", tutor.uid), where("testId", "==", PAPER),
    ));
    expect(mine.docs.map(item => item.id)).toEqual([id]);
    const graded = gradeMockAnswers(paperKey, paperKey);
    await setDoc(ref(tutor, "mockRehearsals", id), rehearsal(tutor, {
      answers: paperKey, status: "finished", finishedAtMs: 1_700_000_200_000, finishReason: "submit", score: graded.score, correct: graded.correct,
    }));
    await expectDenied(setDoc(ref(tutor, "mockRehearsals", id), rehearsal(tutor, { testVersion: "other" })));
    await deleteDoc(ref(tutor, "mockRehearsals", id));
    expect((await getDocFromServer(ref(tutor, "mockRehearsals", id))).exists()).toBe(false);
  });

  it("never touches a student attempt and stays private to its tutor", async () => {
    const id = rehearsalId(tutor);
    await setDoc(ref(tutor, "mockRehearsals", id), rehearsal(tutor));
    expect((await getDoc(ref(tutor, "mockAttempts", `${tutor.uid}_${PAPER}`))).exists()).toBe(false);
    for (const who of [student, secondTutor]) {
      await expectDenied(getDocFromServer(ref(who, "mockRehearsals", id)));
      await expectDenied(setDoc(ref(who, "mockRehearsals", id), rehearsal(tutor)));
      await expectDenied(deleteDoc(ref(who, "mockRehearsals", id)));
    }
    await expectDenied(getDocs(query(collection(student.firestore, "programs", "project-202", "mockRehearsals"), where("uid", "==", tutor.uid))));
    await expectDenied(setDoc(ref(student, "mockRehearsals", rehearsalId(student)), rehearsal(student)));
    await expectDenied(setDoc(ref(tutor, "mockRehearsals", `${secondTutor.uid}_${PAPER}_1`), rehearsal(tutor)));
    await expectDenied(setDoc(ref(tutor, "mockRehearsals", `${tutor.uid}_${PAPER}_2`), rehearsal(tutor, { answers: emptyAnswers(43) })));
    await expectDenied(setDoc(ref(tutor, "mockRehearsals", `${tutor.uid}_${PAPER}_3`), rehearsal(tutor, { durationSeconds: 720 })));
  });
});
