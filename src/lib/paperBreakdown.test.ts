import { describe, expect, it } from "vitest";
import { SMALL_SAMPLE, paperBreakdown, weakestRows } from "./paperBreakdown";

describe("paper breakdown", () => {
  const key = {
    modules: ["m01", "m01", "m01", "m01", "m09", "m09"],
    catalogIds: ["c1", "c1", "c2", "c2", "c7", "c7"],
    skills: ["calculation", "concept", "calculation", "calculation", "interpretation", "concept"] as const,
  };
  const answers = [0, 1, null, 2, 0, null];
  const correct = [true, false, false, true, true, false];
  const dwell = [60_000, 30_000, 0, 90_000, 45_000, 10_000];

  it("counts total, answered, correct and time per module, official module and skill", () => {
    const result = paperBreakdown({ ...key, skills: [...key.skills] }, answers, correct, dwell);
    expect(result.byModule).toEqual([
      { id: "m01", total: 4, answered: 3, correct: 2, timeMs: 180_000, smallSample: false },
      { id: "m09", total: 2, answered: 1, correct: 1, timeMs: 55_000, smallSample: true },
    ]);
    expect(result.byCatalog.map(row => [row.id, row.correct, row.total])).toEqual([["c1", 1, 2], ["c2", 1, 2], ["c7", 1, 2]]);
    expect(result.bySkill[0]).toMatchObject({ id: "calculation", total: 3, correct: 2 });
  });

  it("flags groups below the small-sample threshold instead of judging them", () => {
    const result = paperBreakdown({ modules: Array(SMALL_SAMPLE).fill("m03") }, Array(SMALL_SAMPLE).fill(0), Array(SMALL_SAMPLE).fill(true));
    expect(result.byModule[0]!.smallSample).toBe(false);
  });

  it("has no breakdown for an untagged module test and survives a grading delay", () => {
    expect(paperBreakdown({}, [0, 1], [true, false]).byModule).toEqual([]);
    expect(paperBreakdown({ modules: ["m01"] }, [0], null).byModule[0]).toMatchObject({ answered: 1, correct: 0 });
  });

  it("lists the weakest groups with misses, lowest share first", () => {
    const rows = paperBreakdown({ modules: ["a", "a", "b", "b", "b", "c"] }, Array(6).fill(0), [true, false, false, false, true, true]).byModule;
    expect(weakestRows(rows).map(row => row.id)).toEqual(["b", "a"]);
  });
});
