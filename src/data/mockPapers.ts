import { MOCK_MODULES } from "./mockModules";

/**
 * Mastery Examinations: comprehensive Quantitative Methods papers, 44 questions across every QM
 * module test, 66 minutes. Like a module test, the id is the Firestore
 * document id of the paper and the suffix of every attempt id, so it must
 * never change once a paper has been published. Papers are deliberately kept
 * out of MOCK_MODULES: module views, trends, reminders and the heatmap stay
 * one-test-per-module.
 */
export interface MockPaper {
  id: string;
  number: number;
  /** Roman numeral shown on the paper's badge and in its title. */
  numeral: string;
  title: string;
}

/** What the student and the tutor call this kind of test. */
export const MOCK_PAPER_SECTION = "Mastery Examinations";
export const MOCK_PAPER_KIND = "Mastery Exam";

export const MOCK_PAPERS: readonly MockPaper[] = [
  { id: "qm-paper-01", number: 1, numeral: "I", title: "Mastery Exam · QM Paper I" },
  { id: "qm-paper-02", number: 2, numeral: "II", title: "Mastery Exam · QM Paper II" },
  { id: "qm-paper-03", number: 3, numeral: "III", title: "Mastery Exam · QM Paper III" },
];

export function mockPaperById(id: string): MockPaper | undefined {
  return MOCK_PAPERS.find(paper => paper.id === id);
}

/**
 * The display name of an uploaded test: a paper always shows its registry
 * name, so renaming never needs a re-upload; a module test keeps its title.
 */
export function mockTestTitle(meta: { moduleId: string; title: string }): string {
  return mockPaperById(meta.moduleId)?.title ?? meta.title;
}

export function isMockPaperId(id: string): boolean {
  return MOCK_PAPERS.some(paper => paper.id === id);
}

/** The Quantitative Methods module tests a paper's questions are tagged with. */
export const MOCK_PAPER_MODULE_IDS: readonly string[] = MOCK_MODULES
  .filter(module => module.topic === "Quantitative Methods")
  .map(module => module.id);
