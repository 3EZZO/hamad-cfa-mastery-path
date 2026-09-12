import type {
  PracticeQuestion,
  PracticeQuestionState,
  PracticeRunMode,
} from "./practiceContent";

const DAY_MS = 86_400_000;

export interface PracticeSelectionInput {
  questions: PracticeQuestion[];
  states: Record<string, PracticeQuestionState>;
  mode: PracticeRunMode;
  count: number;
  moduleId?: string | null;
  now?: Date;
}

function stableNoise(id: string): number {
  let value = 2166136261;
  for (const character of id) value = Math.imul(value ^ character.charCodeAt(0), 16777619);
  return (value >>> 0) / 4_294_967_295;
}

function priority(
  question: PracticeQuestion,
  state: PracticeQuestionState | undefined,
  now: number,
  mode: PracticeRunMode
): number {
  if (!state) return 120 + question.difficulty * 2 + stableNoise(question.id);
  const overdueDays = Math.max(0, (now - Date.parse(state.dueAt)) / DAY_MS);
  const accuracy = state.attempts ? state.correctAttempts / state.attempts : 0;
  const weakness = (1 - accuracy) * 55 + state.lapseCount * 10;
  const confidenceMismatch = state.lastCorrect && state.lastConfidence <= 2
    ? 12
    : !state.lastCorrect && state.lastConfidence >= 4
      ? 28
      : 0;
  const slow = state.lastResponseMs > question.estimatedSeconds * 1_500 ? 8 : 0;
  const repairBoost = mode === "repair" ? weakness + confidenceMismatch : 0;
  return overdueDays * 8 + weakness + confidenceMismatch + slow + repairBoost + stableNoise(question.id);
}

export function selectPracticeQuestions({
  questions,
  states,
  mode,
  count,
  moduleId,
  now = new Date(),
}: PracticeSelectionInput): PracticeQuestion[] {
  const eligible = questions.filter(question => !moduleId || question.moduleId === moduleId);
  const due = eligible.filter(question => {
    const state = states[question.id];
    return !state || Date.parse(state.dueAt) <= now.getTime();
  });
  const pool = mode === "repair"
    ? eligible.filter(question => {
        const state = states[question.id];
        return state && (!state.lastCorrect || state.lastConfidence <= 2 || state.lapseCount > 0);
      })
    : due.length >= Math.min(count, eligible.length)
      ? due
      : eligible;
  const selected: PracticeQuestion[] = [];
  const conceptUses = new Map<string, number>();
  const ranked = [...pool].sort(
    (left, right) =>
      priority(right, states[right.id], now.getTime(), mode) -
      priority(left, states[left.id], now.getTime(), mode)
  );
  while (ranked.length && selected.length < count) {
    ranked.sort((left, right) => {
      const leftPenalty = (conceptUses.get(left.conceptId) ?? 0) * 35;
      const rightPenalty = (conceptUses.get(right.conceptId) ?? 0) * 35;
      return (
        priority(right, states[right.id], now.getTime(), mode) - rightPenalty -
        (priority(left, states[left.id], now.getTime(), mode) - leftPenalty)
      );
    });
    const next = ranked.shift()!;
    selected.push(next);
    conceptUses.set(next.conceptId, (conceptUses.get(next.conceptId) ?? 0) + 1);
  }
  return selected;
}

export function updatePracticeQuestionState({
  previous,
  question,
  bankStorageId,
  correct,
  confidence,
  responseMs,
  now = new Date(),
}: {
  previous?: PracticeQuestionState;
  question: PracticeQuestion;
  bankStorageId: string;
  correct: boolean;
  confidence: number;
  responseMs: number;
  now?: Date;
}): PracticeQuestionState {
  const attempts = (previous?.attempts ?? 0) + 1;
  const correctAttempts = (previous?.correctAttempts ?? 0) + (correct ? 1 : 0);
  const priorEase = previous?.ease ?? 2.3;
  const confidencePenalty = correct && confidence <= 2 ? 0.15 : !correct && confidence >= 4 ? 0.3 : 0;
  const speedPenalty = responseMs > question.estimatedSeconds * 1_500 ? 0.1 : 0;
  const ease = Math.min(3, Math.max(1.3, priorEase + (correct ? 0.08 : -0.25) - confidencePenalty - speedPenalty));
  const streak = correct ? (previous?.streak ?? 0) + 1 : 0;
  const lapseCount = (previous?.lapseCount ?? 0) + (correct ? 0 : 1);
  const priorInterval = previous?.intervalDays ?? 0;
  const intervalDays = correct
    ? Math.max(1, Math.round(streak === 1 ? 1 : streak === 2 ? 3 : Math.max(4, priorInterval * ease)))
    : confidence >= 4
      ? 0.25
      : 1;
  const dueAt = new Date(now.getTime() + intervalDays * DAY_MS).toISOString();
  return {
    questionId: question.id,
    bankStorageId,
    attempts,
    correctAttempts,
    streak,
    lapseCount,
    intervalDays,
    ease: Number(ease.toFixed(2)),
    lastCorrect: correct,
    lastConfidence: Math.min(5, Math.max(1, Math.round(confidence))),
    lastResponseMs: Math.max(0, Math.round(responseMs)),
    lastAttemptedAt: now.toISOString(),
    dueAt,
    misconceptionTags: correct ? [] : [...question.tags],
    updatedAtClient: now.toISOString(),
  };
}

export function practiceAccuracy(states: PracticeQuestionState[]): number | null {
  const attempts = states.reduce((sum, state) => sum + state.attempts, 0);
  if (!attempts) return null;
  const correct = states.reduce((sum, state) => sum + state.correctAttempts, 0);
  return Math.round((correct / attempts) * 100);
}
