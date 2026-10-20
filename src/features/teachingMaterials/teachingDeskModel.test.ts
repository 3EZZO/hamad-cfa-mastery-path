import { describe, expect, it } from "vitest";
import type { TeachingSessionEnvelope } from "../liveSession/teachingHost";
import type { LibraryEntry } from "./libraryModel";
import type { MaterialTopic } from "./materialDetails";
import { resumeEntry, sessionModules, sessionTopics, taughtEarlier, upNext } from "./teachingDeskModel";

function entry(versionId: string, title: string, topic: MaterialTopic, readingNumber: number | null = null, current = true): LibraryEntry {
  const version = { versionId, materialId: `m-${versionId}`, title, readingNumber, pageCount: 20 };
  return {
    material: { materialId: `m-${versionId}`, currentVersionId: current ? versionId : "newer" },
    version, sourceVersion: version, topic, detailsRevision: 0,
  } as unknown as LibraryEntry;
}

function envelope(sessionNumber: number, opened: string[], selected: string | null, updatedAtClient: string, rehearsal = false) {
  return {
    sessionNumber, rehearsal, selectedVersionId: selected, updatedAtClient,
    history: opened.map(versionId => ({ versionId, firstOpenedAtClient: updatedAtClient })),
  } as unknown as TeachingSessionEnvelope;
}

describe("teaching desk", () => {
  it("lists the plan's modules and topics for a session", () => {
    const modules = sessionModules(3);
    expect(modules.length).toBeGreaterThan(0);
    expect(modules.map(module => module.number)).toEqual([...modules.map(module => module.number)].sort((a, b) => a - b));
    expect(sessionTopics(3, null)).toEqual([...new Set(modules.map(module => module.topic))]);
    expect(sessionTopics(99, "Economics")).toEqual(["Economics"]);
    expect(sessionTopics(99, null)).toEqual([]);
  });

  it("suggests current, untaught PDFs in topic then reading/module order", () => {
    const entries = [
      entry("e2", "Economics - Module 2", "Economics"),
      entry("q10", "Simple Linear Regression", "Quantitative Methods", 10),
      entry("e1", "Economics - Module 1", "Economics"),
      entry("q9", "Hypothesis Testing", "Quantitative Methods", 9),
      entry("q9-old", "Hypothesis Testing", "Quantitative Methods", 9, false),
      entry("fi", "Fixed Income - Module 1", "Fixed Income"),
    ];
    const taught = taughtEarlier([envelope(2, ["q9"], "q9", "2026-10-10T10:00:00Z"), null, envelope(1, ["e2"], null, "2026-10-01T10:00:00Z", true)]);
    expect([...taught]).toEqual(["q9"]);
    const result = upNext(entries, ["Quantitative Methods", "Economics"], taught);
    expect(result.items.map(item => item.version.versionId)).toEqual(["q10", "e1", "e2"]);
    expect(result.more).toBe(0);
    expect(upNext(entries, ["Economics"], new Set()).items.map(item => item.version.versionId)).toEqual(["e1", "e2"]);
  });

  it("resumes this session's PDF first, then the latest earlier session's", () => {
    const entries = [entry("a", "A", "Economics"), entry("b", "B", "Economics")];
    const earlier = [
      envelope(1, ["a"], "a", "2026-10-01T10:00:00Z"),
      envelope(2, ["b"], "b", "2026-10-08T10:00:00Z"),
      envelope(3, ["gone"], "gone", "2026-10-09T10:00:00Z"),
    ];
    expect(resumeEntry(entries, "a", earlier)?.version.versionId).toBe("a");
    expect(resumeEntry(entries, null, earlier)?.version.versionId).toBe("b");
    expect(resumeEntry(entries, null, [])).toBeNull();
  });
});
