import { describe, expect, it } from "vitest";
import {
  getTutorSession,
  tutorSessionRunId,
  validateSessionImport,
} from "./tutorSessionCatalog";
import { computeTutorPlaybookManifestContentHash } from "./tutorContent";
import { asDraft, syntheticPlaybook } from "../testFixtures/tutorPlaybooks";

describe("session catalog and import boundary", () => {
  it("preserves the exact legacy S1 identity while appointments use the current plan", () => {
    expect(tutorSessionRunId(1, "v1", "a".repeat(64))).toBe(
      "hamad-cfa-mastery-session-01-2026-09-05-v1-aaaaaaaaaaaa"
    );
    expect(getTutorSession(1).session).toMatchObject({
      date: "2026-09-19",
      deliveryDates: ["2026-09-18", "2026-09-19"],
    });
    expect(getTutorSession(2).session.date).toBe("2026-09-26");
    expect(getTutorSession(3).session).toMatchObject({
      date: "2026-10-03",
      durationMinutes: 150,
    });
    expect(getTutorSession(4).session).toMatchObject({
      date: "2026-10-10",
      durationMinutes: 120,
    });
    expect(getTutorSession(2).taskId).not.toBe(getTutorSession(1).taskId);
    expect(tutorSessionRunId(2, "v1", "a".repeat(64))).not.toBe(
      tutorSessionRunId(1, "v1", "a".repeat(64))
    );
  });
  it("accepts only the selected session and rejects an otherwise valid wrong identity", async () => {
    const s2 = asDraft(await syntheticPlaybook(2));
    await expect(validateSessionImport(s2, 2)).resolves.toMatchObject({
      manifest: { sessionNumber: 2 },
    });
    await expect(validateSessionImport(s2, 1)).rejects.toThrow("Session 01");
    s2.manifest.sessionNumber = 1;
    s2.manifest.contentHash = await computeTutorPlaybookManifestContentHash(
      s2.manifest,
      s2.chunks
    );
    await expect(validateSessionImport(s2, 2)).rejects.toThrow("Session 02");
  });
  it("accepts the Session 03 identity only in the Session 03 workspace", async () => {
    const s3 = asDraft(await syntheticPlaybook(3));
    await expect(validateSessionImport(s3, 3)).resolves.toMatchObject({
      manifest: { sessionNumber: 3 },
    });
    await expect(validateSessionImport(s3, 2)).rejects.toThrow("Session 02");
  });
  it("accepts the Session 04 identity only in the Session 04 workspace", async () => {
    const s4 = asDraft(await syntheticPlaybook(4));
    await expect(validateSessionImport(s4, 4)).resolves.toMatchObject({
      manifest: { sessionNumber: 4 },
    });
    await expect(validateSessionImport(s4, 3)).rejects.toThrow("Session 03");
  });
  it("rejects changed private content rather than publishing a corrupt package", async () => {
    const s2 = asDraft(await syntheticPlaybook(2));
    s2.chunks[0]!.stages[0]!.cards[0]!.answer = "Tampered";
    await expect(validateSessionImport(s2, 2)).rejects.toThrow();
  });
});
