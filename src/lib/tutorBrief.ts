import { mockModuleById } from "../data/mockModules";
import type { TrackerState } from "../types";
import { addDays } from "./dates";
import type { MockAttempt } from "./mockTestContent";
import { MOCK_QUESTION_COUNT } from "./mockTestContent";
import type { PracticeQuestion, PracticeRun } from "./practiceContent";
import { isRetestDue } from "./retests";
import { buildRiskIndicators, listOverdueWork, type RiskIndicator } from "./risk";
import { getTaskStatus } from "./taskStatus";

/**
 * What the student did since the last lesson, for the tutor to read before
 * the next one. Pure and read-only: built from the shared tracker, the
 * student's practice runs and the module test attempts the tutor can list.
 */

export interface BriefModuleLine {
  moduleId: string;
  attempted: number;
  correct: number;
  accuracy: number;
}

export interface BriefMiss {
  questionId: string;
  moduleId: string | null;
  prompt: string | null;
  misses: number;
}

export interface BriefModuleTest {
  moduleId: string;
  title: string;
  score: number | null;
  outOf: number;
  submittedAtMs: number;
}

export interface TutorBrief {
  /** YYYY-MM-DD the window starts from (inclusive). */
  since: string;
  sinceSource: "last-session" | "seven-days";
  practice: {
    runs: number;
    answered: number;
    correct: number;
    accuracy: number | null;
    byModule: BriefModuleLine[];
  };
  topMisses: BriefMiss[];
  moduleTests: BriefModuleTest[];
  overdue: { count: number; oldest: string[] };
  dueRetests: number;
  signals: RiskIndicator[];
}

export const BRIEF_LIMITS = { misses: 5, modules: 6, overdue: 3, signals: 3 } as const;

function localDay(ms: number): string {
  const date = new Date(ms);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

/** The last logged session before today, else a seven-day window. */
export function briefWindowStart(tracker: TrackerState, today: string): { since: string; source: TutorBrief["sinceSource"] } {
  const last = tracker.sessionLogs
    .map((log) => log.date)
    .filter((date) => date && date < today)
    .sort()
    .at(-1);
  return last ? { since: last, source: "last-session" } : { since: addDays(today, -7), source: "seven-days" };
}

export function buildTutorBrief({
  tracker,
  questions,
  runs,
  mockAttempts,
  studentUid,
  today,
}: {
  tracker: TrackerState;
  questions: PracticeQuestion[];
  runs: PracticeRun[];
  mockAttempts: MockAttempt[];
  studentUid: string | null;
  /** YYYY-MM-DD. */
  today: string;
}): TutorBrief {
  const { since, source } = briefWindowStart(tracker, today);
  const questionById = new Map(questions.map((question) => [question.id, question]));
  const inWindow = (iso: string) => {
    const ms = Date.parse(iso);
    return Number.isFinite(ms) && localDay(ms) >= since;
  };

  const windowRuns = runs.filter((run) => run.answers.some((answer) => inWindow(answer.answeredAt)));
  const answers = runs.flatMap((run) => run.answers).filter((answer) => inWindow(answer.answeredAt));
  const correct = answers.filter((answer) => answer.correct).length;

  const modules = new Map<string, { attempted: number; correct: number }>();
  const misses = new Map<string, number>();
  for (const answer of answers) {
    const moduleId = questionById.get(answer.questionId)?.moduleId ?? "Unlisted";
    const line = modules.get(moduleId) ?? { attempted: 0, correct: 0 };
    line.attempted += 1;
    if (answer.correct) line.correct += 1;
    modules.set(moduleId, line);
    if (!answer.correct) misses.set(answer.questionId, (misses.get(answer.questionId) ?? 0) + 1);
  }
  const byModule = [...modules.entries()]
    .map(([moduleId, line]) => ({ moduleId, ...line, accuracy: Math.round((line.correct / line.attempted) * 100) }))
    .sort((left, right) => left.accuracy - right.accuracy || right.attempted - left.attempted)
    .slice(0, BRIEF_LIMITS.modules);
  const topMisses = [...misses.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, BRIEF_LIMITS.misses)
    .map(([questionId, count]) => {
      const question = questionById.get(questionId);
      return { questionId, moduleId: question?.moduleId ?? null, prompt: question?.prompt ?? null, misses: count };
    });

  const moduleTests = mockAttempts
    .filter((attempt) => (!studentUid || attempt.uid === studentUid)
      && attempt.submittedAtMs !== null
      && localDay(attempt.submittedAtMs) >= since)
    .sort((left, right) => (right.submittedAtMs ?? 0) - (left.submittedAtMs ?? 0))
    .map((attempt) => ({
      moduleId: attempt.moduleId,
      title: mockModuleById(attempt.moduleId)?.title ?? attempt.moduleId,
      score: attempt.score,
      outOf: MOCK_QUESTION_COUNT,
      submittedAtMs: attempt.submittedAtMs!,
    }));

  const overdue = listOverdueWork(tracker, today)
    .filter(({ task }) => !(task.kind === "session" && getTaskStatus(task, tracker) === "requested"));

  return {
    since,
    sinceSource: source,
    practice: {
      runs: windowRuns.length,
      answered: answers.length,
      correct,
      accuracy: answers.length ? Math.round((correct / answers.length) * 100) : null,
      byModule,
    },
    topMisses,
    moduleTests,
    overdue: {
      count: overdue.length,
      oldest: overdue.slice(0, BRIEF_LIMITS.overdue).map(({ task, dueDate }) => `${task.label} (due ${dueDate})`),
    },
    dueRetests: tracker.errorEntries.filter((entry) => isRetestDue(entry, today)).length,
    signals: buildRiskIndicators(tracker, today).filter((signal) => signal.tone !== "green").slice(0, BRIEF_LIMITS.signals),
  };
}
