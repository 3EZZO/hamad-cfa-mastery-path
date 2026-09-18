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
});
