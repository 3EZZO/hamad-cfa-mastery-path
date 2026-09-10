// Executes synthetic saves against Google's real Rules evaluator. It neither
// reads nor writes Firestore documents and never publishes rules or credentials.
// Usage: node scripts/test-firestore-live-rules.mjs <firebase-tools package path>
// Optional: --rules <file> to reproduce the regression against a prior ruleset.
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { applyTutorLiveRunAction } from "../src/lib/tutorContent.ts";

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
const rulesOption = process.argv.indexOf("--rules");
const content = fs.readFileSync(rulesOption < 0 ? "firestore.rules" : process.argv[rulesOption + 1], "utf8");
const uid = "synthetic-tutor";
const at = "2026-09-10T06:00:00.000Z";
const cases = [];
function add(name, previous, next, expectation = "ALLOW", role = "tutor", active = true, authenticated = true, memberExists = true) {
  cases.push({ name, test: { expectation, expressionReportLevel: "NONE", request: {
    path: `/databases/(default)/documents/programs/project-202/tutorRuns/${next.id}`,
    method: previous ? "update" : "create", auth: authenticated ? { uid, token: {} } : null,
    resource: { data: next },
  }, ...(previous ? { resource: { data: previous } } : {}), functionMocks: [
    { function: "exists", args: [{ anyValue: {} }], result: { value: memberExists } },
    { function: "get", args: [{ anyValue: {} }], result: { value: { data: { active, role } } } },
  ] } });
}
function advance(previous, type, extra = {}) {
  return applyTutorLiveRunAction(previous, {
    runId: previous.id, playbookId: previous.playbookId, playbookVersion: previous.playbookVersion,
    sessionNumber: previous.sessionNumber, routeId: previous.routeId, expectedRevision: previous.revision,
    action: { id: `event-${previous.revision + 1}`, type,
      atClient: new Date(Date.parse(previous.updatedAtClient) + 1000).toISOString(),
      elapsedSeconds: previous.elapsedSeconds + 1, ...extra },
  }, uid);
}
const closeout = {
  mastery: [{ stageId: "stage-01", stageTitle: "Synthetic stage", decision: "amber" }],
  outcome: "o".repeat(2000), nextAction: "n".repeat(2000), homework: "h".repeat(4000),
  delayedRetest: "r".repeat(4000), privateTutorNote: "p".repeat(4000),
};
for (const sessionNumber of [1, 2]) {
  const run = applyTutorLiveRunAction(null, {
    runId: `synthetic-session-${sessionNumber}`, playbookId: `session-${sessionNumber}`, playbookVersion: "v1",
    sessionNumber, routeId: "standard", expectedRevision: 0,
    action: { id: "event-1", type: "start", atClient: at, elapsedSeconds: 0, stageId: "stage-01", cardId: "card-01" },
  }, uid);
  add(`S${sessionNumber}: start with card`, null, run);
  const { cardId: omittedCard, ...startWithoutCard } = run.events[0];
  add(`S${sessionNumber}: start without card`, null, { ...run, currentCardId: null, events: [startWithoutCard] });
  const paused = advance(run, "pause");
  add(`S${sessionNumber}: pause`, run, paused);
  add(`S${sessionNumber}: resume`, paused, advance(paused, "resume"));
  for (const previous of [run, paused]) {
    const extras = [
      ["navigate", { stageId: "s".repeat(80), cardId: "c".repeat(80) }],
      ["navigate", { stageId: "stage-02", cardId: null }],
      ["note", { note: "n".repeat(1000) }],
      ...["correct", "partial", "repair", "parked"].map(result => ["assessment", {
        stageId: "stage-02", cardId: "card-02", result, confidence: 5,
        errorCodes: result === "repair" ? ["D", "T", "P", "S", "A", "I", "C", "OTHER"] : [],
        ...(result === "parked" ? { note: "Deferred with reason." } : {}),
      }]),
      ["repair", { stageId: "stage-02", cardId: "card-02", errorCodes: ["D"] }],
      ["assessment", { stageId: "s".repeat(80), cardId: "c".repeat(80), result: "partial", confidence: 5,
        errorCodes: ["D", "T", "P", "S", "A", "I", "C", "OTHER"], note: "n".repeat(1000) }],
      ["complete", { closeout }],
      ["complete", { closeout, stageId: "stage-02", cardId: "card-02", note: "n".repeat(1000) }],
      ["abandon", {}],
    ];
    for (const [type, extra] of extras) {
      add(`S${sessionNumber}: ${previous.status} ${type} ${extra.result ?? (extra.cardId === null ? "null card" : "")}`,
        previous, advance(previous, type, extra));
    }
  }
  const next = advance(paused, "navigate", { stageId: "stage-02", cardId: "card-02" });
  add(`S${sessionNumber}: student denied`, paused, next, "DENY", "student");
  add(`S${sessionNumber}: inactive tutor denied`, paused, next, "DENY", "tutor", false);
  add(`S${sessionNumber}: anonymous denied`, paused, next, "DENY", "tutor", true, false);
  add(`S${sessionNumber}: missing member denied`, paused, next, "DENY", "tutor", true, true, false);
  add(`S${sessionNumber}: unknown role denied`, paused, next, "DENY", "administrator");
  for (const [name, fields] of Object.entries({
    "wrong revision": { revision: paused.revision },
    "wrong session": { sessionNumber: sessionNumber === 1 ? 2 : 1 },
    "wrong version": { playbookVersion: "other-version" },
    "wrong route": { routeId: "other-route" },
    "wrong actor": { updatedBy: "someone-else" },
    "unknown field": { unexpected: true },
    "missing appended event": { events: paused.events },
    "wrong elapsed": { elapsedSeconds: 28801 },
    "wrong current card": { currentCardId: "unrelated" },
    "wrong current stage": { currentStageId: "unrelated" },
    "wrong event time": { updatedAtClient: "2026-09-10T06:59:00.000Z" },
    "wrong end time": { endedAtClient: at },
  })) add(`S${sessionNumber}: deny ${name}`, paused, { ...next, ...fields }, "DENY");
  const completed = advance(paused, "complete", { closeout });
  add(`S${sessionNumber}: terminal run immutable`, completed, { ...next, revision: completed.revision + 1, events: [...completed.events, next.events.at(-1)] }, "DENY");
  const assessment = advance(paused, "assessment", { stageId: "stage-02", cardId: "card-02", result: "correct", confidence: 3, errorCodes: [] });
  for (const [name, fields] of Object.entries({
    "correct with error tags": { errorCodes: ["D"] },
    "repair without error tags": { result: "repair" },
    "parked without note": { result: "parked" },
    "invalid confidence": { confidence: 6 },
    "unknown error tag": { result: "partial", errorCodes: ["INVALID"] },
    "oversized note": { note: "n".repeat(1001) },
    "unknown event property": { unexpected: true },
    "assessment with closeout": { closeout },
  })) add(`S${sessionNumber}: deny ${name}`, paused, { ...assessment,
    events: [...paused.events, { ...assessment.events.at(-1), ...fields }] }, "DENY");
  const invalidPause = { ...next, events: [...paused.events, { ...next.events.at(-1), type: "pause" }] };
  add(`S${sessionNumber}: cannot pause an already paused run`, paused, invalidPause, "DENY");
  const note = advance(paused, "note", { note: "Synthetic progress." });
  for (const fields of [{ errorCodes: ["D"] }, { result: "correct" }]) {
    add(`S${sessionNumber}: note with forbidden ${Object.keys(fields)[0]}`, paused,
      { ...note, events: [...paused.events, { ...note.events.at(-1), ...fields }] }, "DENY");
  }
  const { closeout: omittedCloseout, ...withoutCloseout } = completed.events.at(-1);
  add(`S${sessionNumber}: complete without closeout`, paused,
    { ...completed, events: [...paused.events, withoutCloseout] }, "DENY");
  const events = [run.events[0], ...Array.from({ length: 998 }, (_, index) => ({
    id: `event-${index + 2}`, type: "note", atClient: new Date(Date.parse(at) + (index + 1) * 1000).toISOString(),
    elapsedSeconds: index + 1, note: "Synthetic teaching progress.",
  }))];
  const longRun = { ...run, events, revision: 999, elapsedSeconds: 998, updatedAtClient: events.at(-1).atClient };
  add(`S${sessionNumber}: full 1000-event history`, longRun, advance(longRun, "note", { note: "Last permitted action." }));
}
// The REST test service infers timestamp types from RFC3339 JSON strings.
// Prefix them in synthetic fixtures to retain the string type used by the SDK.
const asRuleValues = value => JSON.parse(JSON.stringify(value).replace(/2026-(\d\d-\d\dT)/g, "test-$1"));
let failed = 0;
for (let offset = 0; offset < cases.length; offset += 10) {
  const batch = cases.slice(offset, offset + 10);
  const response = await client.post(`/projects/${project}:test`, {
    source: { files: [{ name: "firestore.rules", content }] },
    testSuite: { testCases: asRuleValues(batch.map(item => item.test)) },
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
console.log(`Real Firestore Rules engine: ${cases.length - failed}/${cases.length} cases passed. No Firestore documents written.`);
if (failed) process.exitCode = 1;
