import { MOCK_MODULES } from "./mockModules";

/**
 * Comprehensive Quantitative Methods papers: 44 questions across every QM
 * module test, 66 minutes. Like a module test, the id is the Firestore
 * document id of the paper and the suffix of every attempt id, so it must
 * never change once a paper has been published. Papers are deliberately kept
 * out of MOCK_MODULES: module views, trends, reminders and the heatmap stay
 * one-test-per-module.
 */
export interface MockPaper {
  id: string;
  number: number;
  title: string;
}

export const MOCK_PAPERS: readonly MockPaper[] = [
  { id: "qm-paper-01", number: 1, title: "Full QM mock 1" },
  { id: "qm-paper-02", number: 2, title: "Full QM mock 2" },
  { id: "qm-paper-03", number: 3, title: "Full QM mock 3" },
];

export function mockPaperById(id: string): MockPaper | undefined {
  return MOCK_PAPERS.find(paper => paper.id === id);
}

export function isMockPaperId(id: string): boolean {
  return MOCK_PAPERS.some(paper => paper.id === id);
}

/** The Quantitative Methods module tests a paper's questions are tagged with. */
export const MOCK_PAPER_MODULE_IDS: readonly string[] = MOCK_MODULES
  .filter(module => module.topic === "Quantitative Methods")
  .map(module => module.id);
