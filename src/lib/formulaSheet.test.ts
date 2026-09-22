import { describe, expect, it } from "vitest";
import {
  buildFormulaSheet,
  countFormulae,
  filterFormulaSheet,
  moduleTitle,
} from "./formulaSheet";
import type { PracticeQuestion } from "./practiceContent";

// Synthetic fixtures only; no bank content from the private library.
function question(
  id: string,
  moduleId: string,
  formulae: string[],
): PracticeQuestion {
  return {
    id,
    moduleId,
    conceptId: "c",
    type: "calculation",
    difficulty: 3,
    estimatedSeconds: 90,
    prompt: "?",
    options: ["a", "b", "c"],
    correctOption: 0,
    explanation: "",
    working: [],
    formulae,
    distractorExplanations: ["", "", ""],
    examTrap: "",
    tags: [],
  };
}

const banks = [
  {
    topic: "Economics",
    questions: [
      question("e1", "m012-market-structures", ["Elasticity = %ΔQ / %ΔP"]),
    ],
  },
  {
    topic: "Quantitative Methods",
    questions: [
      question("q1", "m001-returns", ["HPR = (P1 - P0 + D) / P0", "  HPR = (P1 - P0 + D) / P0 "]),
      question("q2", "m001-returns", ["HPR = (P1 - P0 + D) / P0", "Geometric mean = (Π(1 + r))^(1/n) - 1"]),
      question("q3", "m001-returns", []),
      question("q4", "m002-tvm", ["PV = FV / (1 + r)^n"]),
    ],
  },
];

describe("buildFormulaSheet", () => {
  it("dedupes formulae per module, counts citing questions and orders by curriculum topic", () => {
    const groups = buildFormulaSheet(banks);
    expect(groups.map((group) => [group.topic, group.moduleId])).toEqual([
      ["Quantitative Methods", "m001-returns"],
      ["Quantitative Methods", "m002-tvm"],
      ["Economics", "m012-market-structures"],
    ]);
    expect(groups[0]!.formulae).toEqual([
      { text: "HPR = (P1 - P0 + D) / P0", questionCount: 2 },
      { text: "Geometric mean = (Π(1 + r))^(1/n) - 1", questionCount: 1 },
    ]);
    expect(countFormulae(groups)).toBe(4);
  });

  it("names modules after the official outline module of the same number", () => {
    expect(moduleTitle("m001-returns")).toMatch(/^M001 · Returns/);
    expect(moduleTitle("returns")).toBe("returns");
    expect(moduleTitle("m999-unknown")).toBe("m999-unknown");
    expect(buildFormulaSheet(banks)[0]!.moduleTitle).toMatch(/^M001 · /);
  });

  it("returns nothing for banks without formulae", () => {
    expect(buildFormulaSheet([{ topic: "Economics", questions: [question("x", "m012", [""])] }])).toEqual([]);
    expect(buildFormulaSheet([])).toEqual([]);
  });
});

describe("filterFormulaSheet", () => {
  const groups = buildFormulaSheet(banks);

  it("keeps every group for an empty query", () => {
    expect(filterFormulaSheet(groups, "   ")).toBe(groups);
  });

  it("matches formula text case-insensitively and drops empty groups", () => {
    const filtered = filterFormulaSheet(groups, "hpr");
    expect(filtered).toHaveLength(1);
    expect(filtered[0]!.formulae.map((entry) => entry.text)).toEqual(["HPR = (P1 - P0 + D) / P0"]);
  });

  it("keeps a whole module when the module title or topic matches", () => {
    expect(filterFormulaSheet(groups, "economics")[0]!.formulae).toHaveLength(1);
    expect(filterFormulaSheet(groups, "M001")[0]!.formulae).toHaveLength(2);
    expect(filterFormulaSheet(groups, "no such thing")).toEqual([]);
  });
});
