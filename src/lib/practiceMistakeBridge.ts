import { TOPICS } from "../data/plan";
import { addDays } from "./dates";
import type { PracticeQuestion, PracticeQuestionType } from "./practiceContent";
import type { ErrorEntry, TrackerState } from "../types";

/** Days until the vault asks for the retest of a bridged miss. */
export const PRACTICE_MISS_RETEST_DAYS = 3;

const CATEGORY_BY_TYPE: Record<PracticeQuestionType, string> = {
  concept: "Concept gap",
  calculation: "Formula / process",
  interpretation: "Reading error",
  trap: "Confidence error",
};

/** Deterministic id so the same question can only ever be bridged once. */
export function practiceMistakeId(questionId: string): string {
  return `practice-miss-${questionId}`;
}

export interface BuildPracticeMistakeOptions {
  question: PracticeQuestion;
  /** Curriculum topic of the question's bank; must be one of TOPICS. */
  topic: string;
  bankId: string;
  selectedOption: 0 | 1 | 2;
  date: string;
}

/**
 * Turns a Practice Coach miss into a Mistake Review entry: the prompt as the
 * summary, the correct answer, explanation and exam trap as the correction,
 * a retest three days out. Returns null when the bank's topic is not a
 * curriculum area, since the vault only files under those.
 */
export function buildPracticeMistake({
  question,
  topic,
  bankId,
  selectedOption,
  date,
}: BuildPracticeMistakeOptions): ErrorEntry | null {
  if (!(TOPICS as readonly string[]).includes(topic)) return null;
  const chosen = question.options[selectedOption];
  const correct = question.options[question.correctOption];
  const correction = [
    `Correct: ${correct}. Chose: ${chosen}.`,
    question.explanation,
    question.examTrap ? `Exam trap: ${question.examTrap}` : "",
  ]
    .filter(Boolean)
    .join(" ")
    .slice(0, 400);
  return {
    id: practiceMistakeId(question.id),
    date,
    topic,
    category: CATEGORY_BY_TYPE[question.type] ?? "Concept gap",
    summary: question.prompt.slice(0, 300),
    correction,
    revisitDate: addDays(date, PRACTICE_MISS_RETEST_DAYS),
    resolved: false,
    questionId: question.id,
    bankId,
  };
}

/** Question ids already present in the vault, whatever their resolved state. */
export function bridgedQuestionIds(entries: readonly Pick<ErrorEntry, "questionId">[]): Set<string> {
  return new Set(entries.flatMap((entry) => (entry.questionId ? [entry.questionId] : [])));
}

/**
 * Adds the entry unless the vault already holds that question. An existing
 * entry is left exactly as the tutor or student edited it.
 */
export function addPracticeMistake(
  tracker: TrackerState,
  entry: ErrorEntry,
): { tracker: TrackerState; added: boolean } {
  const exists = tracker.errorEntries.some(
    (item) => item.id === entry.id || (entry.questionId && item.questionId === entry.questionId),
  );
  if (exists) return { tracker, added: false };
  return { tracker: { ...tracker, errorEntries: [entry, ...tracker.errorEntries] }, added: true };
}
