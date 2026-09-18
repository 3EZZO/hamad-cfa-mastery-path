import type {
  PracticeQuestion,
  PracticeQuestionState,
  PracticeRun,
  PracticeRunMode,
} from "./practiceContent";

const DAY_MS = 86_400_000;

export interface PracticeModuleInsight {
  moduleId: string;
  questionCount: number;
  attempted: number;
  correct: number;
  accuracy: number | null;
  lapses: number;
  due: number;
  lastAttemptedAt: string | null;
}

export interface PracticeMissInsight {
  question: PracticeQuestion;
  selectedOption: 0 | 1 | 2;
  confidence: number;
  responseMs: number;
  answeredAt: string;
  missCount: number;
  recovered: boolean;
  calculatorLog?: any[];
  diagnostics?: any[];
}

export interface PracticeRunInsight {
  id: string;
  mode: PracticeRunMode;
  completedAt: string;
  attempted: number;
  correct: number;
  accuracy: number;
  averageConfidence: number;
}

export interface PracticeInsights {
  totalAttempts: number;
  totalCorrect: number;
  accuracy: number | null;
  dueQuestions: number;
  practicedQuestions: number;
  availableQuestions: number;
  masteredQuestions: number;
  recentAttempts: number;
  recentAccuracy: number | null;
  averageResponseSeconds: number | null;
  confidenceGaps: number;
  modules: PracticeModuleInsight[];
  missedQuestions: PracticeMissInsight[];
  recentRuns: PracticeRunInsight[];
}

function validTime(value: string): number | null {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function buildPracticeInsights({
  questions,
  states,
  runs,
  now = new Date(),
}: {
  questions: PracticeQuestion[];
  states: Record<string, PracticeQuestionState>;
  runs: PracticeRun[];
  now?: Date;
}): PracticeInsights {
  const questionById = new Map(questions.map(question => [question.id, question]));
  const stateValues = Object.values(states);
  const totalAttempts = stateValues.reduce((sum, state) => sum + state.attempts, 0);
  const totalCorrect = stateValues.reduce((sum, state) => sum + state.correctAttempts, 0);
  const nowMs = now.getTime();
  const recentCutoff = nowMs - 7 * DAY_MS;
  const answers = runs.flatMap(run => run.answers);
  const recentAnswers = answers.filter(answer => {
    const time = validTime(answer.answeredAt);
    return time !== null && time >= recentCutoff && time <= nowMs;
  });
  const responseAnswers = answers.filter(answer => answer.responseMs > 0);

  const moduleIds = [...new Set(questions.map(question => question.moduleId))];
  const modules = moduleIds.map(moduleId => {
    const moduleQuestions = questions.filter(question => question.moduleId === moduleId);
    const moduleStates = moduleQuestions.flatMap(question => {
      const state = states[question.id];
      return state ? [state] : [];
    });
    const attempted = moduleStates.reduce((sum, state) => sum + state.attempts, 0);
    const correct = moduleStates.reduce((sum, state) => sum + state.correctAttempts, 0);
    const lastAttemptedAt = moduleStates
      .map(state => state.lastAttemptedAt)
      .sort((left, right) => right.localeCompare(left))[0] ?? null;
    return {
      moduleId,
      questionCount: moduleQuestions.length,
      attempted,
      correct,
      accuracy: attempted ? Math.round((correct / attempted) * 100) : null,
      lapses: moduleStates.reduce((sum, state) => sum + state.lapseCount, 0),
      due: moduleStates.filter(state => Date.parse(state.dueAt) <= nowMs).length,
      lastAttemptedAt,
    } satisfies PracticeModuleInsight;
  }).sort((left, right) => {
    if (left.attempted === 0 && right.attempted > 0) return 1;
    if (right.attempted === 0 && left.attempted > 0) return -1;
    return (left.accuracy ?? 101) - (right.accuracy ?? 101) || right.lapses - left.lapses;
  });

  const missesByQuestion = new Map<string, PracticeMissInsight>();
  const missCounts = new Map<string, number>();
  answers
    .filter(answer => !answer.correct)
    .sort((left, right) => right.answeredAt.localeCompare(left.answeredAt))
    .forEach(answer => {
      const question = questionById.get(answer.questionId);
      if (!question) return;
      missCounts.set(answer.questionId, (missCounts.get(answer.questionId) ?? 0) + 1);
      if (missesByQuestion.has(answer.questionId)) return;
      missesByQuestion.set(answer.questionId, {
        question,
        selectedOption: answer.selectedOption,
        confidence: answer.confidence,
        responseMs: answer.responseMs,
        answeredAt: answer.answeredAt,
        missCount: 1,
        recovered: states[answer.questionId]?.lastCorrect === true,
        calculatorLog: answer.calculatorLog,
      });
    });
  const missedQuestions = [...missesByQuestion.values()]
    .map(miss => ({ ...miss, missCount: missCounts.get(miss.question.id) ?? 1 }))
    .sort((left, right) => right.answeredAt.localeCompare(left.answeredAt));

  const recentRuns = runs
    .filter((run): run is PracticeRun & { completedAtClient: string } =>
      run.status === "completed" && run.completedAtClient !== null
    )
    .map(run => {
      const correct = run.answers.filter(answer => answer.correct).length;
      const attempted = run.answers.length;
      return {
        id: run.id,
        mode: run.mode,
        completedAt: run.completedAtClient,
        attempted,
        correct,
        accuracy: attempted ? Math.round((correct / attempted) * 100) : 0,
        averageConfidence: attempted
          ? Number((run.answers.reduce((sum, answer) => sum + answer.confidence, 0) / attempted).toFixed(1))
          : 0,
      } satisfies PracticeRunInsight;
    })
    .sort((left, right) => right.completedAt.localeCompare(left.completedAt));

  return {
    totalAttempts,
    totalCorrect,
    accuracy: totalAttempts ? Math.round((totalCorrect / totalAttempts) * 100) : null,
    dueQuestions: stateValues.filter(state => Date.parse(state.dueAt) <= nowMs).length,
    practicedQuestions: stateValues.length,
    availableQuestions: questions.length,
    masteredQuestions: stateValues.filter(state =>
      state.attempts >= 2 && state.streak >= 2 && state.correctAttempts / state.attempts >= 0.8
    ).length,
    recentAttempts: recentAnswers.length,
    recentAccuracy: recentAnswers.length
      ? Math.round((recentAnswers.filter(answer => answer.correct).length / recentAnswers.length) * 100)
      : null,
    averageResponseSeconds: responseAnswers.length
      ? Math.round(responseAnswers.reduce((sum, answer) => sum + answer.responseMs, 0) / responseAnswers.length / 1_000)
      : null,
    confidenceGaps: answers.filter(answer =>
      (!answer.correct && answer.confidence >= 4) || (answer.correct && answer.confidence <= 2)
    ).length,
    modules,
    missedQuestions,
    recentRuns,
  };
}
