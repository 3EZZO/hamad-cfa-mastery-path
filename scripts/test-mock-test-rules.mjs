// Evaluates the module mock test rules with Google's real Rules engine using
// synthetic requests. It neither reads nor writes Firestore documents and
// never publishes rules. Usage (after `firebase login` as the owner):
//   node scripts/test-mock-test-rules.mjs <firebase-tools 15.28.1 package path>
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const cliDirectory = process.argv[2];
if (!cliDirectory) throw new Error("Pass the installed firebase-tools package directory (15.28.1).");
const requireCli = createRequire(path.resolve(cliDirectory, "package.json"));
const { version } = requireCli("./package.json");
if (version !== "15.28.1") throw new Error("Use the pinned firebase-tools 15.28.1 package.");
const auth = requireCli("./lib/auth.js");
const { requireAuth } = requireCli("./lib/requireAuth.js");
const { Client } = requireCli("./lib/apiv2.js");
const { logger } = requireCli("./lib/logger.js");
for (const transport of logger.transports) transport.level = "error";
const project = "project-202-tracker";
const options = { project, nonInteractive: true };
const account = auth.getProjectDefaultAccount(process.cwd());
if (account) auth.setActiveAccount(options, account);
await requireAuth(options);
const client = new Client({ urlPrefix: "https://firebaserules.googleapis.com", apiVersion: "v1" });
const content = fs.readFileSync("firestore.rules", "utf8");

const ROOT = "/databases/(default)/documents/programs/project-202";
const STUDENT = "synthetic-student";
const TUTOR = "synthetic-tutor";
const MODULE = "m01-rates-and-returns";
const ATTEMPT = `${STUDENT}_${MODULE}`;
// The REST test service reads RFC3339 strings as timestamps.
const START = "2026-09-26T09:00:00Z";
const IN_TIME = "2026-09-26T09:05:00Z";
const GRACE = "2026-09-26T09:12:10Z";
const LATE = "2026-09-26T09:13:00Z";

const publishedMeta = { status: "published", version: "v1" };
const key = { moduleId: MODULE, version: "v1", correct: [0, 2, 1, 1, 0, 0, 1, 1] };
const nulls = Array(8).fill(null);
const falses = Array(8).fill(false);
const newAttempt = (at = START) => ({
  uid: STUDENT, moduleId: MODULE, testVersion: "v1", attemptNumber: 1, status: "active",
  startedAt: at, lastSeenAt: at, answers: nulls, flags: falses, incidents: [], keystrokes: [],
  submittedAt: null, finishReason: null, score: null, correct: null, reviewReleased: false,
});
const active = newAttempt();
const answers = [0, 2, 1, 0, null, 0, 1, 2];
const submitted = { ...active, answers, status: "submitted", finishReason: "submit", submittedAt: IN_TIME, lastSeenAt: IN_TIME };
const graded = { correct: [true, true, true, false, false, true, true, false], score: 5 };

function mocks({ role = "student", uid = STUDENT, docs = {} }) {
  const member = { function: "get", args: [{ exactValue: `${ROOT}/members/${uid}` }], result: { value: { data: { active: true, role } } } };
  const memberExists = { function: "exists", args: [{ exactValue: `${ROOT}/members/${uid}` }], result: { value: true } };
  const list = [member, memberExists];
  for (const [docPath, data] of Object.entries(docs)) {
    const full = `${ROOT}/${docPath}`;
    list.push({ function: "exists", args: [{ exactValue: full }], result: { value: data !== null } });
    if (data !== null) {
      list.push({ function: "get", args: [{ exactValue: full }], result: { value: { data } } });
      list.push({ function: "getAfter", args: [{ exactValue: full }], result: { value: { data } } });
      list.push({ function: "existsAfter", args: [{ exactValue: full }], result: { value: true } });
    } else {
      list.push({ function: "existsAfter", args: [{ exactValue: full }], result: { value: false } });
    }
  }
  return list;
}

const cases = [];
function add(name, expectation, { method, docPath, uid = STUDENT, role = "student", time = IN_TIME, resource, next, docs = {} }) {
  cases.push({ name, test: {
    expectation,
    expressionReportLevel: "NONE",
    request: {
      path: `${ROOT}/${docPath}`, method, time,
      auth: { uid, token: {} },
      ...(next ? { resource: { data: next } } : {}),
    },
    ...(resource ? { resource: { data: resource } } : {}),
    functionMocks: mocks({ role, uid, docs }),
  } });
}

const baseDocs = { [`mockTests/${MODULE}`]: publishedMeta, [`mockAttemptCounters/${ATTEMPT}`]: null };

// Starting the one attempt.
add("student starts a published test at request.time", "ALLOW", { method: "create", docPath: `mockAttempts/${ATTEMPT}`, time: START, next: newAttempt(), docs: baseDocs });
add("student cannot backdate the start", "DENY", { method: "create", docPath: `mockAttempts/${ATTEMPT}`, time: IN_TIME, next: newAttempt(START), docs: baseDocs });
add("student cannot start a draft test", "DENY", { method: "create", docPath: `mockAttempts/${ATTEMPT}`, time: START, next: newAttempt(), docs: { ...baseDocs, [`mockTests/${MODULE}`]: { status: "draft", version: "v1" } } });
add("student cannot start with answers pre-filled", "DENY", { method: "create", docPath: `mockAttempts/${ATTEMPT}`, time: START, next: { ...newAttempt(), answers: [0, 0, 0, 0, 0, 0, 0, 0] }, docs: baseDocs });
add("student cannot start another student's attempt", "DENY", { method: "create", docPath: `mockAttempts/other_${MODULE}`, time: START, next: newAttempt(), docs: baseDocs });
add("tutor cannot create an attempt", "DENY", { method: "create", docPath: `mockAttempts/${ATTEMPT}`, uid: TUTOR, role: "tutor", time: START, next: { ...newAttempt(), uid: TUTOR }, docs: baseDocs });

// Saving and finishing.
add("student autosaves answers in time", "ALLOW", { method: "update", docPath: `mockAttempts/${ATTEMPT}`, resource: active, next: { ...active, answers, lastSeenAt: IN_TIME } });
add("student autosave inside the 15 s grace", "ALLOW", { method: "update", docPath: `mockAttempts/${ATTEMPT}`, time: GRACE, resource: active, next: { ...active, answers, lastSeenAt: GRACE } });
add("student cannot change answers after the deadline", "DENY", { method: "update", docPath: `mockAttempts/${ATTEMPT}`, time: LATE, resource: active, next: { ...active, answers, lastSeenAt: LATE } });
add("student cannot rewrite logged incidents", "DENY", { method: "update", docPath: `mockAttempts/${ATTEMPT}`, resource: { ...active, incidents: [{ type: "tab-hidden", atClient: "x", elapsedMs: 5 }] }, next: { ...active, incidents: [], lastSeenAt: IN_TIME } });
const logged = { ...active, incidents: [{ type: "tab-hidden", atClient: "x", elapsedMs: 5 }] };
add("student appends to an existing incident log", "ALLOW", { method: "update", docPath: `mockAttempts/${ATTEMPT}`, resource: logged, next: { ...logged, incidents: [...logged.incidents, { type: "window-blur", atClient: "y", elapsedMs: 9 }], lastSeenAt: IN_TIME } });
add("student submits in time", "ALLOW", { method: "update", docPath: `mockAttempts/${ATTEMPT}`, resource: active, next: submitted });
add("student forfeits with Leave Test", "ALLOW", { method: "update", docPath: `mockAttempts/${ATTEMPT}`, resource: active, next: { ...submitted, status: "forfeited", finishReason: "leave" } });
add("forfeit must say leave", "DENY", { method: "update", docPath: `mockAttempts/${ATTEMPT}`, resource: active, next: { ...submitted, status: "forfeited", finishReason: "submit" } });
add("student locks an expired attempt with saved answers", "ALLOW", { method: "update", docPath: `mockAttempts/${ATTEMPT}`, time: LATE, resource: { ...active, answers }, next: { ...active, answers, status: "submitted", finishReason: "expired", submittedAt: LATE, lastSeenAt: LATE } });
add("expired lock cannot change answers", "DENY", { method: "update", docPath: `mockAttempts/${ATTEMPT}`, time: LATE, resource: { ...active, answers }, next: { ...active, answers: nulls, status: "submitted", finishReason: "expired", submittedAt: LATE, lastSeenAt: LATE } });
add("student cannot reopen a submitted attempt", "DENY", { method: "update", docPath: `mockAttempts/${ATTEMPT}`, resource: submitted, next: { ...submitted, status: "active" } });

// Grading.
const keyDocs = { [`mockTestKeys/${MODULE}`]: key };
add("student stores the correct grade", "ALLOW", { method: "update", docPath: `mockAttempts/${ATTEMPT}`, resource: submitted, next: { ...submitted, ...graded }, docs: keyDocs });
add("student cannot inflate the score", "DENY", { method: "update", docPath: `mockAttempts/${ATTEMPT}`, resource: submitted, next: { ...submitted, ...graded, score: 8 }, docs: keyDocs });
add("student cannot mark a wrong answer right", "DENY", { method: "update", docPath: `mockAttempts/${ATTEMPT}`, resource: submitted, next: { ...submitted, correct: Array(8).fill(true), score: 8 }, docs: keyDocs });
add("student cannot grade an active attempt", "DENY", { method: "update", docPath: `mockAttempts/${ATTEMPT}`, resource: { ...active, answers }, next: { ...active, answers, ...graded }, docs: keyDocs });
add("student cannot release their own review", "DENY", { method: "update", docPath: `mockAttempts/${ATTEMPT}`, resource: { ...submitted, ...graded }, next: { ...submitted, ...graded, reviewReleased: true } });

// Reading the key, review and questions.
const attemptDoc = state => ({ [`mockAttempts/${ATTEMPT}`]: state });
add("student cannot read the key while active", "DENY", { method: "get", docPath: `mockTestKeys/${MODULE}`, resource: key, docs: attemptDoc(active) });
add("student reads the key once locked", "ALLOW", { method: "get", docPath: `mockTestKeys/${MODULE}`, resource: key, docs: attemptDoc(submitted) });
add("student cannot read the review before release", "DENY", { method: "get", docPath: `mockTestReviews/${MODULE}`, resource: { items: [] }, docs: attemptDoc(submitted) });
add("student reads the review after release", "ALLOW", { method: "get", docPath: `mockTestReviews/${MODULE}`, resource: { items: [] }, docs: attemptDoc({ ...submitted, reviewReleased: true }) });
add("student cannot preview questions before starting", "DENY", { method: "get", docPath: `mockTestQuestions/${MODULE}`, resource: { questions: [] }, docs: { ...baseDocs, ...attemptDoc(null) } });
add("student reads questions after starting", "ALLOW", { method: "get", docPath: `mockTestQuestions/${MODULE}`, resource: { questions: [] }, docs: { ...baseDocs, ...attemptDoc(active) } });
add("student cannot see a draft test", "DENY", { method: "get", docPath: `mockTests/${MODULE}`, resource: { status: "draft" } });
add("student sees a published test", "ALLOW", { method: "get", docPath: `mockTests/${MODULE}`, resource: publishedMeta });
add("student cannot read another student's attempt", "DENY", { method: "get", docPath: `mockAttempts/other_${MODULE}`, resource: { ...active, uid: "other" } });

// Tutor controls.
const historyId = `${ATTEMPT}_1`;
add("tutor resets with an archive in the same batch", "ALLOW", { method: "delete", docPath: `mockAttempts/${ATTEMPT}`, uid: TUTOR, role: "tutor", resource: submitted, docs: { [`mockAttemptHistory/${historyId}`]: { id: ATTEMPT } } });
add("tutor cannot delete without archiving", "DENY", { method: "delete", docPath: `mockAttempts/${ATTEMPT}`, uid: TUTOR, role: "tutor", resource: submitted, docs: { [`mockAttemptHistory/${historyId}`]: null } });
add("student cannot delete their attempt", "DENY", { method: "delete", docPath: `mockAttempts/${ATTEMPT}`, resource: submitted, docs: { [`mockAttemptHistory/${historyId}`]: { id: ATTEMPT } } });
add("tutor releases the review", "ALLOW", { method: "update", docPath: `mockAttempts/${ATTEMPT}`, uid: TUTOR, role: "tutor", resource: submitted, next: { ...submitted, reviewReleased: true } });
add("tutor cannot edit the student's answers", "DENY", { method: "update", docPath: `mockAttempts/${ATTEMPT}`, uid: TUTOR, role: "tutor", resource: submitted, next: { ...submitted, answers: key.correct } });
add("student cannot write the attempt counter", "DENY", { method: "update", docPath: `mockAttemptCounters/${ATTEMPT}`, resource: { next: 2 }, next: { next: 1 } });
add("tutor cannot change a published key", "DENY", { method: "update", docPath: `mockTestKeys/${MODULE}`, uid: TUTOR, role: "tutor", resource: key, next: { ...key, correct: [1, 1, 1, 1, 1, 1, 1, 1] }, docs: { [`mockTests/${MODULE}`]: publishedMeta } });
add("tutor edits a draft key", "ALLOW", { method: "update", docPath: `mockTestKeys/${MODULE}`, uid: TUTOR, role: "tutor", resource: key, next: { ...key, correct: [1, 1, 1, 1, 1, 1, 1, 1] }, docs: { [`mockTests/${MODULE}`]: { status: "draft", version: "v1" } } });
add("student cannot write a key", "DENY", { method: "update", docPath: `mockTestKeys/${MODULE}`, resource: key, next: key, docs: { [`mockTests/${MODULE}`]: { status: "draft", version: "v1" } } });

let failed = 0;
for (let offset = 0; offset < cases.length; offset += 10) {
  const batch = cases.slice(offset, offset + 10);
  const response = await client.post(`/projects/${project}:test`, {
    source: { files: [{ name: "firestore.rules", content }] },
    testSuite: { testCases: batch.map(item => item.test) },
  }, { skipLog: { body: true, resBody: true } });
  if (response.body.issues?.some(issue => issue.severity === "ERROR")) {
    throw new Error(JSON.stringify(response.body.issues));
  }
  if (response.body.testResults?.length !== batch.length) throw new Error("Incomplete Rules API response.");
  for (const [index, result] of response.body.testResults.entries()) {
    if (result.state !== "SUCCESS") {
      failed += 1;
      console.error(`FAIL ${batch[index].name}: ${result.debugMessages?.join(" ") || "Unexpected allow/deny result"}`);
    }
  }
}
console.log(`Real Firestore Rules engine: ${cases.length - failed}/${cases.length} mock-test cases passed. No Firestore documents written.`);
if (failed) process.exitCode = 1;
