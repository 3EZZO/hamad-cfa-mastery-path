import { describe, expect, it } from "vitest";
import type { PracticeQuestion } from "../../lib/practiceContent";
import { focusScroll, focusZoom, regionFromDrag, sanitizeRegion } from "./exhibitFocus";
import { sanitizeLessonPath, withCopiedStops, withStop } from "./lessonPathModel";
import { nextQuickCheck, quickCheckCatalogIds, quickCheckLine, quickCheckPool } from "./quickCheckModel";
import { MOCK_MODULES } from "../../data/mockModules";

const question = (id: string, moduleId: string): PracticeQuestion => ({
  id, moduleId, conceptId: "c", type: "calculation", difficulty: 3, estimatedSeconds: 90, prompt: `Q ${id}`,
  options: ["a", "b", "c"], correctOption: 1, explanation: "e", working: [], formulae: [],
  distractorExplanations: ["", "", ""], examTrap: "", tags: [],
} as unknown as PracticeQuestion);

describe("exhibit focus", () => {
  it("turns a drag into a page rectangle and ignores tiny drags", () => {
    expect(regionFromDrag({ x: 0.6, y: 0.5 }, { x: 0.2, y: 0.1 })).toEqual({ x: 0.2, y: 0.1, w: 0.4, h: 0.4 });
    expect(regionFromDrag({ x: 0.5, y: 0.5 }, { x: 0.51, y: 0.9 })).toBeNull();
    expect(regionFromDrag({ x: -0.2, y: 0.5 }, { x: 0.3, y: 1.4 })).toEqual({ x: 0, y: 0.5, w: 0.3, h: 0.5 });
  });

  it("zooms so the exhibit fills the view, within the reader's limits", () => {
    const page = { width: 612, height: 792 };
    const container = { width: 1248, height: 848 };
    const half = focusZoom({ x: 0, y: 0, w: 0.5, h: 0.25 }, container, page);
    expect(half).toBeGreaterThan(1);
    expect(focusZoom({ x: 0, y: 0, w: 0.05, h: 0.05 }, container, page)).toBe(3);
    expect(focusScroll({ x: 0.5, y: 0.5, w: 0.2, h: 0.2 }, { left: 24, top: 24, width: 1000, height: 1400 }, { width: 800, height: 600 }))
      .toEqual({ left: 224, top: 564 });
  });

  it("accepts only sane stored regions", () => {
    expect(sanitizeRegion({ x: 0.1, y: 0.1, w: 0.5, h: 0.5 })).toEqual({ x: 0.1, y: 0.1, w: 0.5, h: 0.5 });
    expect(sanitizeRegion({ x: 0.8, y: 0.1, w: 0.5, h: 0.5 })).toBeNull();
    expect(sanitizeRegion({ x: 0.1, y: 0.1, w: 0.01, h: 0.5 })).toBeNull();
    expect(sanitizeRegion("x")).toBeNull();
  });

  it("keeps a stop's focus and never stores an undefined focus", () => {
    const region = { x: 0.1, y: 0.2, w: 0.3, h: 0.3 };
    const path = withStop(withStop([], { versionId: "a", page: 2, prompt: "", focus: region }, undefined, 1)!, { versionId: "a", page: 3, prompt: "" }, undefined, 2)!;
    expect(path[0]!.focus).toEqual(region);
    expect("focus" in path[1]!).toBe(false);
    expect(sanitizeLessonPath(path)).toEqual(path);
    expect(withCopiedStops([], path, 5)[0]!.focus).toEqual(region);
    expect("focus" in sanitizeLessonPath([{ ...path[1], focus: { x: 2 } }])[0]!).toBe(false);
  });
});

describe("quick checks", () => {
  const banks = [
    { storageId: "qm", title: "QM bank", topic: "Quantitative Methods", questions: [question("q1", "m001-returns"), question("q8", "m008-portfolio"), question("q10", "m010-regression"), question("q11", "m011-data")] },
    { storageId: "ec", title: "Econ bank", topic: "Economics", questions: [question("e12", "m012-firms"), question("e40", "m040-other"), question("x", "custom-id")] },
  ];

  it("matches Portfolio Mathematics to module 8, excluding other QM and session questions", () => {
    const pool = quickCheckPool(banks, { title: "Portfolio Mathematics", topic: "Quantitative Methods" });
    expect(pool).toMatchObject({ scope: "reading", moduleNumbers: [8] });
    expect(pool.items.map(item => item.key)).toEqual(["qm:q8"]);
  });

  it("reuses each approved module mapping and supported upload labels", () => {
    for (const module of MOCK_MODULES) {
      expect(quickCheckCatalogIds({ title: module.title, topic: module.topic })).toEqual(module.catalogIds);
    }
    expect(quickCheckCatalogIds({ title: "Economics - Module 3 - Fiscal Policy.pdf", topic: "Economics" })).toEqual(["cfa-2027-outline-m014"]);
    expect(quickCheckCatalogIds({ title: "Reading 05 - Portfolio Mathematics", topic: "Quantitative Methods" })).toEqual(["cfa-2027-outline-m008"]);
    expect(quickCheckCatalogIds({ title: "Firms and Market Structure", topic: "Economics" })).toEqual(["cfa-2027-outline-m012"]);
    expect(quickCheckCatalogIds({ title: "Understanding Business Cycle", topic: "Economics" })).toEqual(["cfa-2027-outline-m013"]);
    expect(quickCheckCatalogIds({ title: "The Return and Risk of a Financial Portfolio", topic: "Quantitative Methods" })).toEqual(["cfa-2027-outline-m008"]);
  });

  it("does not guess from a reading number, mixed title, wrong topic or broad topic bank", () => {
    for (const pdf of [
      { title: "Reading 05", topic: "Quantitative Methods" },
      { title: "Portfolio Mathematics", topic: "Economics" },
      { title: "Fiscal Policy and Monetary Policy", topic: "Economics" },
      { title: "Formula Sheet", topic: "Quantitative Methods" },
    ]) expect(quickCheckPool(banks, pdf)).toEqual({ items: [], scope: "none", moduleNumbers: [] });
    expect(quickCheckPool(banks, { title: "Fiscal Policy", topic: "Economics" })).toEqual({ items: [], scope: "reading", moduleNumbers: [14] });
    expect(quickCheckPool(banks, { title: "The Firm and Market Structures", topic: "Economics" }).items.map(item => item.key)).toEqual(["ec:e12"]);
  });

  it("asks unasked questions first and summarises the results", () => {
    const pool = [
      ...quickCheckPool(banks, { title: "Simple Linear Regression", topic: "Quantitative Methods" }).items,
      ...quickCheckPool(banks, { title: "Introduction to Big Data Techniques", topic: "Quantitative Methods" }).items,
    ];
    expect(nextQuickCheck(pool, new Set(["qm:q10"]), () => 0)!.key).toBe("qm:q11");
    expect(nextQuickCheck(pool, new Set(["qm:q10", "qm:q11"]), () => 0.99)!.key).toBe("qm:q11");
    expect(nextQuickCheck([], new Set())).toBeNull();
    expect(quickCheckLine([])).toBeUndefined();
    expect(quickCheckLine([{ key: "a", chosen: 1, correct: true }, { key: "b", chosen: 0, correct: false }])).toBe("Quick checks: 1 of 2 correct.");
  });
});
