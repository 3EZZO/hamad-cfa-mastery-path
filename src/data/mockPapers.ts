import { MOCK_MODULES } from "./mockModules";
import { READING_CATALOG } from "./readings";

/**
 * Mock Exams: one comprehensive paper per CFA Level I topic, 45 questions in
 * 67.5 minutes, built from the hardest unseen questions of that topic. Like a
 * module test, the id is the Firestore document id of the paper and the
 * suffix of every attempt id, so it must never change once a paper has been
 * uploaded (`qm-paper-01` predates this list and keeps its id). Papers are
 * deliberately kept out of MOCK_MODULES: module views, trends, reminders and
 * the heatmap stay one-test-per-module.
 */
export interface MockPaper {
  id: string;
  /** Curriculum topic, as in the study plan and the reading catalog. */
  topic: string;
  /** Short badge code, as on the module tests (QM, EC, ...). */
  code: string;
  title: string;
  /**
   * Pass mark: the fewest correct answers that clear the paper, defined for a
   * paper of exactly `outOf` questions. Judged on the correct count, never on
   * a rounded percentage. `ready` is the fewest correct answers for the
   * middle "exam-ready" band below the pass mark.
   */
  pass: { correct: number; ready: number; outOf: number };
}

/** What the student and the tutor call this kind of test. */
export const MOCK_PAPER_SECTION = "Mock Exams";
export const MOCK_PAPER_KIND = "Mock Exam";

/**
 * The owner's pass mark for every 45-question paper: 38 of 45 (84.44%) clears
 * it; 30 to 37 (66.67% and up) is exam-ready; below 30 is not passed.
 */
export const MOCK_PAPER_PASS = { correct: 38, ready: 30, outOf: 45 } as const;

const paper = (id: string, topic: string, code: string, title = `${topic} Paper`): MockPaper => ({ id, topic, code, title, pass: MOCK_PAPER_PASS });

/**
 * In curriculum order. A topic's further papers follow its first one; until
 * the tutor publishes a paper, only the tutor sees it (as a rehearsal), so a
 * second paper can serve as a tutor-led teaching paper without reaching the
 * student's tests or results.
 */
export const MOCK_PAPERS: readonly MockPaper[] = [
  paper("eth-paper-01", "Ethical and Professional Standards", "ETH"),
  paper("qm-paper-01", "Quantitative Methods", "QM"),
  paper("ec-paper-01", "Economics", "EC"),
  paper("fsa-paper-01", "Financial Statement Analysis", "FSA"),
  paper("ci-paper-01", "Corporate Issuers", "CI"),
  paper("eq-paper-01", "Equity Investments", "EQ"),
  paper("fi-paper-01", "Fixed Income", "FI"),
  paper("der-paper-01", "Derivatives", "DER"),
  paper("alt-paper-01", "Alternative Investments", "ALT"),
  paper("pm-paper-01", "Portfolio Management", "PM"),
];

/**
 * Paper ids that were used and are now out of the app. Their stored draft and
 * tutor rehearsals stay in Firestore, so an id here must never be registered
 * again: a new paper under it would inherit them. `qm-paper-02` was QM Paper
 * II, a tutor-only draft teaching paper, never published, retired after its
 * rehearsal with Hamad on 2026-11-21.
 */
export const RETIRED_MOCK_PAPER_IDS: readonly string[] = ["qm-paper-02"];

/** Drops uploaded tests of retired papers, so no tutor list or count shows them. */
export function withoutRetiredPapers<T extends { moduleId: string }>(metas: readonly T[]): T[] {
  return metas.filter(meta => !RETIRED_MOCK_PAPER_IDS.includes(meta.moduleId));
}

export function mockPaperById(id: string): MockPaper | undefined {
  return MOCK_PAPERS.find(entry => entry.id === id);
}

/**
 * The display name of an uploaded test: a paper always shows its registry
 * name, so renaming never needs a re-upload; a module test keeps its title.
 */
export function mockTestTitle(meta: { moduleId: string; title: string }): string {
  return mockPaperById(meta.moduleId)?.title ?? meta.title;
}

export function isMockPaperId(id: string): boolean {
  return MOCK_PAPERS.some(entry => entry.id === id);
}

/** Module tests of a paper's topic (QM and Economics have them; other topics have none yet). */
export function paperModuleTestIds(paperId: string): string[] {
  const topic = mockPaperById(paperId)?.topic;
  return MOCK_MODULES.filter(module => module.topic === topic).map(module => module.id);
}

/** Official 2027 curriculum modules (READING_CATALOG ids) of a paper's topic. */
export function paperCatalogIds(paperId: string): string[] {
  const topic = mockPaperById(paperId)?.topic;
  return READING_CATALOG.readings.filter(reading => reading.topic === topic).map(reading => reading.id);
}
