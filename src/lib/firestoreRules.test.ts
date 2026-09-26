import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const rules = readFileSync(resolve(process.cwd(), "firestore.rules"), "utf8");

function blockBetween(start: string, end: string): string {
  const startIndex = rules.indexOf(start);
  const endIndex = rules.indexOf(end, startIndex + start.length);
  expect(startIndex).toBeGreaterThanOrEqual(0);
  expect(endIndex).toBeGreaterThan(startIndex);
  return rules.slice(startIndex, endIndex);
}

describe("private tutor Firestore rule boundary", () => {
  it("lets only the active tutor resolve the student practice owner", () => {
    const members = blockBetween(
      "match /programs/project-202/members/{uid}",
      "match /programs/project-202/tracker/current"
    );
    expect(members).toContain("allow get: if signedIn() && request.auth.uid == uid");
    expect(members).toContain("allow list: if activeProject202Role('tutor')");
    expect(members).toContain("allow create, update, delete: if false");
  });

  it("accepts the September migration without permitting a schema downgrade or student schedule change", () => {
    expect(rules).toContain("scheduleVersion in ['weekly-saturday-v2', 'weekly-saturday-v3', 'weekly-saturday-v4']");
    expect(rules).toContain("resource.data.state.scheduleVersion != 'weekly-saturday-v4'");
    expect(rules).toContain("request.resource.data.state.scheduleVersion == 'weekly-saturday-v4'");
    const studentVersion = blockBetween("function studentPreservesScheduleVersion()", "function validTrackerEnvelope()");
    expect(studentVersion).toContain("== resource.data.state.scheduleVersion");
    expect(rules).toContain("sessionCompletionReviews.size() <= 64");
    expect(rules).toContain("studentPreservesTutorControlledState()");
  });
  it("protects playbook manifests and immutable chunks with the tutor role", () => {
    const playbooks = blockBetween(
      "match /programs/project-202/tutorPlaybooks/{playbookId}",
      "match /programs/project-202/tutorRuns/{runId}"
    );

    expect(playbooks).toContain("allow get: if activeProject202Role('tutor')");
    expect(playbooks).toContain("allow list: if false");
    expect(playbooks).toContain("validTutorPlaybookManifestUpdate()");
    expect(playbooks).toContain("allow update, delete: if false");
    expect(playbooks).not.toContain("activeProject202Role('student')");
  });

  it("allows only tutor live-run access and enforces one meaningful appended event", () => {
    const runs = blockBetween(
      "match /programs/project-202/tutorRuns/{runId}",
      "match /{document=**}"
    );

    expect(runs).toContain("allow get: if activeProject202Role('tutor')");
    expect(runs).toContain("allow list: if false");
    expect(runs).toContain("validTutorLiveRunLatestEvent()");
    expect(runs).toContain("allow delete: if activeProject202Role('tutor')");
    expect(runs).not.toContain("activeProject202Role('student')");
    expect(rules).toContain(
      "data.events.size() == previous.events.size() + 1"
    );
    expect(rules).toContain("event.type != 'start'");
    expect(rules).toContain("event.result != 'repair'");
    expect(rules).toContain("previous.status in ['running', 'paused']");
    expect(rules).toContain(
      "data.status == previous.status"
    );
    expect(rules).not.toContain("!(event.result in ['partial', 'repair'])");
  });

  it("caches live-run maps instead of exhausting the rule expression budget", () => {
    const liveValidation = blockBetween("function validTutorLiveRun(runId)", "match /programs/project-202/tutorPrivate/notes");
    // Each function binds the map once. The Rules API regression suite verifies
    // actual saves; this guard prevents reintroducing repeated long paths.
    expect(liveValidation).not.toMatch(/request\.resource\.data\./);
    expect(liveValidation).not.toMatch(/(?<!request\.)resource\.data\./);
    expect(liveValidation).toContain("let fields = event.keys();");
    expect(liveValidation).toContain("fields.hasAll(['stageId', 'cardId', 'result', 'confidence', 'errorCodes'])");
  });

  it("keeps a final deny-all rule for anonymous and unrecognized paths", () => {
    expect(rules).toMatch(
      /match \/\{document=\*\*\}[\s\S]*allow read, write: if false;/
    );
  });

  it("publishes immutable student-safe practice banks and isolates student records", () => {
    const practice = blockBetween(
      "function validPracticeBank(storageId)",
      "function validPrivateTutorNotesEnvelope()"
    );
    expect(practice).toContain("match /programs/project-202/practiceBanks/{storageId}");
    expect(practice).toContain("allow get, list: if activeProject202Member()");
    expect(practice).toContain("allow create: if activeProject202Role('tutor')");
    expect(practice).toContain("allow update, delete: if false");
    expect(practice).toContain("match /programs/project-202/practiceAssignments/current");
    expect(practice).toContain("request.auth.uid == uid");
    expect(practice).toContain("validPracticeQuestionState(questionId)");
    expect(practice).toContain("validPracticeRun(runId, uid)");
  });

  it("allows exact public receipt lookup while preventing enumeration and fact changes", () => {
    const receipts = blockBetween(
      "function validPublicReceiptVerification(token)",
      "// Tutor Payments configuration",
    );
    expect(receipts).toContain(
      "match /programs/project-202/publicReceiptVerifications/{token}",
    );
    expect(receipts).toContain("allow get: if true");
    expect(receipts).toContain("allow list, delete: if false");
    expect(receipts).toContain("activeProject202Role('tutor')");
    expect(receipts).toContain("data.token == token");
    expect(receipts).toContain("request.resource.data.issuedBy == request.auth.uid");
    expect(receipts).toContain(".hasOnly(['status', 'revokedAtClient'])");
  });
});

describe("module mock test Firestore rule boundary", () => {
  const mock = () => blockBetween("// ---- Module mock tests", "function validPracticeBank(storageId)");
  const match = (path: string) => {
    const block = mock();
    const start = block.indexOf(`match /programs/project-202/${path}`);
    expect(start).toBeGreaterThanOrEqual(0);
    const next = block.indexOf("match /programs/project-202/", start + 1);
    return block.slice(start, next < 0 ? undefined : next);
  };

  it("lets only the student create one attempt, stamped with the server clock", () => {
    const attempts = match("mockAttempts/{attemptId}");
    expect(attempts).toContain("allow create: if activeProject202Role('student') && validNewMockAttempt(attemptId)");
    expect(mock()).toContain("attemptId == request.auth.uid + '_' + data.moduleId");
    expect(mock()).toContain("data.startedAt == request.time");
    expect(mock()).toContain("mockTestIsPublished(data.moduleId)");
    expect(mock()).toContain("data.attemptNumber == (exists(counter) ? get(counter).data.next : 1)");
  });

  it("enforces the 12-minute deadline and freezes answers once it passes", () => {
    expect(mock()).toContain("request.time <= attempt.startedAt + duration.value(735, 's')");
    const late = blockBetween("function mockStudentFinishLate()", "function mockCorrectAt(");
    expect(late).toContain("!mockDeadlineOpen(previous)");
    expect(late).toContain(".hasOnly(['status', 'submittedAt', 'finishReason', 'lastSeenAt'])");
    expect(late).toContain("data.finishReason == 'expired'");
  });

  it("keeps incident and keystroke logs append-only", () => {
    expect(mock()).toContain("(previous.size() == 0 || next[0:previous.size()] == previous)");
    expect(mock()).toContain("mockAppendOnly(data.incidents, previous.incidents, 100)");
  });

  it("accepts a score only when it equals the key applied to the frozen answers", () => {
    const grade = blockBetween("function mockStudentGrade()", "match /programs/project-202/mockTests/{moduleId}");
    expect(grade).toContain("previous.status in ['submitted', 'forfeited']");
    expect(grade).toContain("previous.score == null");
    expect(grade).toContain(".hasOnly(['score', 'correct'])");
    expect(grade).toContain("mockCorrectAt(data, key, 7)");
    expect(mock()).toContain("data.correct[index] == (data.answers[index] == key.correct[index])");
  });

  it("never serves the answer key or review before the attempt is locked", () => {
    const keys = match("mockTestKeys/{moduleId}");
    expect(keys).toContain("mockAttemptLocked(request.auth.uid + '_' + moduleId)");
    expect(keys).toContain("allow list, delete: if false");
    const reviews = match("mockTestReviews/{moduleId}");
    expect(reviews).toContain("mockAttemptLocked(request.auth.uid + '_' + moduleId)");
    expect(reviews).toContain(".data.reviewReleased == true");
    const questions = match("mockTestQuestions/{moduleId}");
    expect(questions).toContain("exists(mockDoc('mockAttempts', request.auth.uid + '_' + moduleId))");
    expect(mock()).toContain("get(mockDoc('mockAttempts', attemptId)).data.status in ['submitted', 'forfeited']");
  });

  it("hides drafts and lets only the tutor author, publish, release and reset", () => {
    const tests = match("mockTests/{moduleId}");
    expect(tests).toContain("resource == null || resource.data.status == 'published'");
    expect(tests).toContain("allow create, update: if activeProject202Role('tutor') && validMockTestMeta(moduleId)");
    for (const path of ["mockTestQuestions/{moduleId}", "mockTestKeys/{moduleId}", "mockTestReviews/{moduleId}"]) {
      const block = match(path);
      expect(block).toContain("allow create, update: if activeProject202Role('tutor')");
      expect(block).toContain("mockTestIsDraftAfter(moduleId)");
      expect(block).not.toContain("activeProject202Role('student')");
    }
    const attempts = match("mockAttempts/{attemptId}");
    expect(attempts).toContain(".hasOnly(['reviewReleased', 'score', 'correct'])");
    expect(attempts).toContain("allow delete: if activeProject202Role('tutor')");
    expect(attempts).toContain("existsAfter(mockDoc('mockAttemptHistory'");
    const history = match("mockAttemptHistory/{historyId}");
    expect(history).toContain("allow update, delete: if false");
    expect(history).not.toContain("activeProject202Role('student')");
    const counters = match("mockAttemptCounters/{attemptId}");
    expect(counters).toContain("allow create, update: if activeProject202Role('tutor')");
    expect(counters).not.toContain("activeProject202Role('student')");
  });
});
