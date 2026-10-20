import { describe, expect, it } from "vitest";
import {
  describePages, formatPages, MAX_COVERAGE_ENTRIES, mergeCoverage, parsePages, sanitizeCoverage,
  taughtPagesByVersion, withTaughtPage, withTeachingSeconds,
} from "./coverageModel";

describe("teaching coverage", () => {
  it("round-trips compact page ranges", () => {
    expect(formatPages([7, 1, 2, 3, 4, 9, 10, 2])).toBe("1-4,7,9-10");
    expect(parsePages("1-4,7,9-10")).toEqual([1, 2, 3, 4, 7, 9, 10]);
    expect(parsePages("x,0,5-3,2")).toEqual([2]);
    expect(describePages("1-4,7")).toBe("pp. 1–4, 7");
    expect(describePages("7")).toBe("p. 7");
  });

  it("adds a taught page once and accumulates time", () => {
    let list = withTaughtPage([], "v1", 3);
    list = withTaughtPage(list, "v1", 4);
    const same = withTaughtPage(list, "v1", 4);
    expect(same).toEqual(list);
    list = withTeachingSeconds(list, "v1", 14.6);
    list = withTeachingSeconds(list, "v1", 15.2);
    expect(list).toEqual([{ versionId: "v1", pages: "3-4", seconds: 30 }]);
    expect(withTeachingSeconds(list, "v1", 0)).toEqual(list);
  });

  it("merges two copies of one session by page union and larger time", () => {
    const merged = mergeCoverage([{ versionId: "v1", pages: "1-3", seconds: 90 }], [
      { versionId: "v1", pages: "3-5", seconds: 60 }, { versionId: "v2", pages: "2", seconds: 20 },
    ]);
    expect(merged).toEqual([{ versionId: "v1", pages: "1-5", seconds: 90 }, { versionId: "v2", pages: "2", seconds: 20 }]);
  });

  it("sanitizes stored coverage and keeps the newest bounded list", () => {
    expect(sanitizeCoverage("nope")).toEqual([]);
    expect(sanitizeCoverage([{ versionId: "v1", pages: "2,1", seconds: 12.4 }, { versionId: 3 }, { versionId: "v2", pages: "1", seconds: -1 }]))
      .toEqual([{ versionId: "v1", pages: "1-2", seconds: 12 }]);
    const many = Array.from({ length: MAX_COVERAGE_ENTRIES + 5 }, (_, index) => ({ versionId: `v${index}`, pages: "1", seconds: 1 }));
    const kept = sanitizeCoverage(many);
    expect(kept).toHaveLength(MAX_COVERAGE_ENTRIES);
    expect(kept.at(-1)!.versionId).toBe(`v${MAX_COVERAGE_ENTRIES + 4}`);
  });

  it("unions pages per version across sessions", () => {
    const map = taughtPagesByVersion([[{ versionId: "v1", pages: "1-2", seconds: 1 }], [{ versionId: "v1", pages: "2-3", seconds: 1 }]]);
    expect([...map.get("v1")!]).toEqual([1, 2, 3]);
  });
});

describe("session summary text", async () => {
  const { defaultOutcome } = await import("./SessionSummaryDialog");
  it("lists only PDFs with taught pages", () => {
    expect(defaultOutcome([
      { versionId: "a", label: "Reading 13 · Fiscal Policy", pages: "1-4,7", pagesTaught: 5, pageCount: 20, minutes: 25 },
      { versionId: "b", label: "Glance", pages: "", pagesTaught: 0, pageCount: 9, minutes: 1 },
    ])).toBe("Taught from PDF: Reading 13 · Fiscal Policy (pp. 1–4, 7, 25 min).");
    expect(defaultOutcome([])).toBe("");
  });
});
