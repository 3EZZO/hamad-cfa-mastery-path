/**
 * A synthetic 44-question paper upload (schema 2) for tests. No real mock
 * content is ever committed: stems, options and explanations are placeholders.
 */
import { MOCK_PAPER_MODULE_IDS } from "../data/mockPapers";

export const SYNTHETIC_PAPER_ID = "qm-paper-01";

const SKILLS = ["calculation", "concept", "interpretation", "trap"] as const;

export function syntheticTree(title = "Synthetic tree") {
  return {
    title,
    description: "Two synthetic branches, each splitting into two outcomes.",
    rootLabel: "Start",
    branches: [
      { label: "Up", probability: "0.60", children: [
        { label: "Up-up", probability: "0.50" },
        { label: "Up-down", probability: "0.50" },
      ] },
      { label: "Down", probability: "0.40", children: [
        { label: "Down-up", probability: "0.30" },
        { label: "Down-down", probability: "0.70" },
      ] },
    ],
  };
}

export function syntheticPaperQuestion(index: number, overrides: Record<string, unknown> = {}) {
  const authored = index % 11 === 10;
  return {
    id: `qmp01-q${String(index + 1).padStart(2, "0")}`,
    stem: `Synthetic paper stem ${index + 1}`,
    table: null,
    figure: null,
    tree: null,
    options: ["Alpha.", "Beta.", "Gamma."],
    correctOption: index % 3,
    concept: "Synthetic concept",
    explanation: "Synthetic explanation",
    working: ["step"],
    keystrokes: "",
    distractors: ["a", "b", "c"],
    confidence: "High",
    tags: {
      moduleTag: MOCK_PAPER_MODULE_IDS[index % MOCK_PAPER_MODULE_IDS.length],
      catalogId: `cfa-2027-outline-m${String((index % 11) + 1).padStart(3, "0")}`,
      los: ["synthetic learning outcome"],
      skill: SKILLS[index % SKILLS.length],
      exhibitPolicy: "none",
    },
    source: authored
      ? { authoring: "authored", bankId: "", sourcePage: null, note: "synthetic authored item" }
      : { authoring: "source", bankId: `synthetic-bank-${index + 1}`, sourcePage: index + 3, note: "" },
    ...overrides,
  };
}

export function syntheticPaper(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 2,
    kind: "paper",
    moduleId: SYNTHETIC_PAPER_ID,
    version: "paper-test-1",
    title: "Synthetic full mock",
    source: "Unit test fixture",
    questions: Array.from({ length: 44 }, (_, index) => syntheticPaperQuestion(index)),
    ...overrides,
  };
}
