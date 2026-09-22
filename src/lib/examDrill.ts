import type { PracticeQuestion, PracticeRun } from "./practiceContent";

/** Exam pacing: 90 seconds per question, as in the Level I sitting. */
export const EXAM_SECONDS_PER_QUESTION = 90;

export function examTimeLimitMs(questionCount: number): number {
  return Math.max(1, questionCount) * EXAM_SECONDS_PER_QUESTION * 1_000;
}

/**
 * Time evidenced by the run itself: the recorded response time of every
 * answered question plus the live time on the current one. Wall-clock time
 * spent away from the run (closed app, hub, another day) is never added,
 * which mirrors the Session Mode clock. A reopened run therefore restarts
 * the current question's clock, never the whole exam.
 */
export function examElapsedMs(
  run: Pick<PracticeRun, "answers" | "status">,
  questionStartedAtMs: number | null,
  nowMs: number,
): number {
  const recorded = run.answers.reduce((sum, answer) => sum + Math.max(0, answer.responseMs), 0);
  const live =
    run.status === "active" && questionStartedAtMs !== null
      ? Math.max(0, nowMs - questionStartedAtMs)
      : 0;
  return recorded + live;
}

export function examRemainingMs(
  run: Pick<PracticeRun, "answers" | "status" | "questionIds">,
  questionStartedAtMs: number | null,
  nowMs: number,
): number {
  return Math.max(
    0,
    examTimeLimitMs(run.questionIds.length) - examElapsedMs(run, questionStartedAtMs, nowMs),
  );
}

export function formatClock(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1_000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export interface ExamSection {
  /** Bank topic (curriculum area) or, for a single-topic run, the module. */
  label: string;
  attempted: number;
  correct: number;
  unanswered: number;
  /** Mean recorded response time of the answered questions, in ms. */
  averageResponseMs: number | null;
  /** Percentage of the section's questions answered correctly (unanswered count as wrong). */
  accuracy: number;
}

export interface ExamReport {
  total: number;
  answered: number;
  correct: number;
  unanswered: number;
  /** True when the run completed with questions left, i.e. the clock ran out. */
  expired: boolean;
  timeLimitMs: number;
  /** Recorded response time across the answered questions. */
  elapsedMs: number;
  sections: ExamSection[];
}

/**
 * End-of-run breakdown. Grouping prefers the curriculum topic; when every
 * question shares one topic, sections fall back to modules so the report
 * still says something. Unanswered questions count as wrong, as in the exam.
 */
export function buildExamReport(
  run: Pick<PracticeRun, "answers" | "questionIds" | "status" | "completedAtClient">,
  questionsById: ReadonlyMap<string, PracticeQuestion>,
  topicByQuestionId: (questionId: string) => string | undefined,
): ExamReport {
  const lookup = (id: string) => questionsById.get(id);
  const answerById = new Map(run.answers.map((answer) => [answer.questionId, answer]));
  const topics = new Set(run.questionIds.map((id) => topicByQuestionId(id) ?? "Practice"));
  const byModule = topics.size <= 1;

  const groups = new Map<string, { attempted: number; correct: number; unanswered: number; responseMs: number[] }>();
  for (const questionId of run.questionIds) {
    const label = byModule
      ? lookup(questionId)?.moduleId ?? "Practice"
      : topicByQuestionId(questionId) ?? "Practice";
    let group = groups.get(label);
    if (!group) {
      group = { attempted: 0, correct: 0, unanswered: 0, responseMs: [] };
      groups.set(label, group);
    }
    const answer = answerById.get(questionId);
    if (!answer) {
      group.unanswered += 1;
      continue;
    }
    group.attempted += 1;
    if (answer.correct) group.correct += 1;
    group.responseMs.push(Math.max(0, answer.responseMs));
  }

  const sections: ExamSection[] = [...groups.entries()].map(([label, group]) => {
    const total = group.attempted + group.unanswered;
    return {
      label,
      attempted: group.attempted,
      correct: group.correct,
      unanswered: group.unanswered,
      averageResponseMs: group.responseMs.length
        ? Math.round(group.responseMs.reduce((sum, value) => sum + value, 0) / group.responseMs.length)
        : null,
      accuracy: total ? Math.round((group.correct / total) * 100) : 0,
    };
  });

  const answered = run.answers.length;
  const correct = run.answers.filter((answer) => answer.correct).length;
  const total = run.questionIds.length;
  return {
    total,
    answered,
    correct,
    unanswered: total - answered,
    expired: run.status === "completed" && answered < total,
    timeLimitMs: examTimeLimitMs(total),
    elapsedMs: examElapsedMs({ answers: run.answers, status: "completed" }, null, 0),
    sections,
  };
}
