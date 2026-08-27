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
  it("protects playbook manifests and immutable chunks with the tutor role", () => {
    const playbooks = blockBetween(
      "match /programs/project-202/tutorPlaybooks/{playbookId}",
      "match /programs/project-202/tutorRuns/{runId}",
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
      "match /{document=**}",
    );

    expect(runs).toContain("allow get: if activeProject202Role('tutor')");
    expect(runs).toContain("allow list: if false");
    expect(runs).toContain("validTutorLiveRunLatestEvent()");
    expect(runs).toContain("allow delete: if activeProject202Role('tutor')");
    expect(runs).not.toContain("activeProject202Role('student')");
    expect(rules).toContain(
      "request.resource.data.events.size() == resource.data.events.size() + 1",
    );
    expect(rules).toContain("event.type != 'start'");
    expect(rules).toContain("event.result != 'repair'");
    expect(rules).not.toContain("!(event.result in ['partial', 'repair'])");
  });

  it("keeps a final deny-all rule for anonymous and unrecognized paths", () => {
    expect(rules).toMatch(
      /match \/\{document=\*\*\}[\s\S]*allow read, write: if false;/,
    );
  });
});
