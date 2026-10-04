import { READING_INDEX } from "../data/readings";
import type { PracticeRun, PublishedPracticeBank } from "./practiceContent";
import { catalogIdForPracticeModule } from "./practiceLinks";
import { weekCatalogIds } from "./weekTests";

/**
 * Tutor controls for practice banks: banks grouped by topic with their lock
 * state, the curriculum modules each bank covers, Hamad's accuracy per bank,
 * and the modules taught so far that no bank covers yet. Pure.
 */

type Bank = Pick<PublishedPracticeBank, "storageId" | "title" | "topic"> & {
  questions: ReadonlyArray<{ id: string; moduleId: string }>;
};

export interface BankTopicGroup<B extends Bank = Bank> {
  topic: string;
  banks: B[];
  unlocked: number;
  questions: number;
}

export function bankTopicGroups<B extends Bank>(banks: readonly B[], assigned: readonly string[]): Array<BankTopicGroup<B>> {
  const groups = new Map<string, BankTopicGroup<B>>();
  for (const bank of banks) {
    const group = groups.get(bank.topic) ?? { topic: bank.topic, banks: [], unlocked: 0, questions: 0 };
    group.banks.push(bank);
    group.questions += bank.questions.length;
    if (assigned.includes(bank.storageId)) group.unlocked += 1;
    groups.set(bank.topic, group);
  }
  return [...groups.values()];
}

/** The assignment after unlocking or locking every bank of a topic. */
export function setTopicUnlocked(assigned: readonly string[], banks: readonly Bank[], unlocked: boolean): string[] {
  const ids = new Set(banks.map((bank) => bank.storageId));
  const others = assigned.filter((id) => !ids.has(id));
  return unlocked ? [...others, ...banks.map((bank) => bank.storageId)] : others;
}

/** Curriculum module numbers a bank's questions cover, ascending. */
export function bankModules(bank: Bank): number[] {
  const numbers = new Set<number>();
  for (const question of bank.questions) {
    const catalogId = catalogIdForPracticeModule(question.moduleId);
    const reading = catalogId ? READING_INDEX.get(catalogId) : undefined;
    if (reading) numbers.add(reading.number);
  }
  return [...numbers].sort((left, right) => left - right);
}

/** "Modules 14–16", "Modules 12, 14", "Module 9". */
export function moduleRangeText(numbers: readonly number[]): string {
  if (numbers.length === 0) return "No curriculum module";
  if (numbers.length === 1) return `Module ${numbers[0]}`;
  const consecutive = numbers.every((value, index) => index === 0 || value === numbers[index - 1]! + 1);
  return consecutive ? `Modules ${numbers[0]}–${numbers.at(-1)}` : `Modules ${numbers.join(", ")}`;
}

/** Hamad's answers to a bank's questions across all practice sets. */
export function bankAccuracy(bank: Bank, runs: readonly PracticeRun[]): { answered: number; accuracy: number | null } {
  const ids = new Set(bank.questions.map((question) => question.id));
  let answered = 0;
  let correct = 0;
  for (const run of runs) {
    for (const answer of run.answers) {
      if (!ids.has(answer.questionId)) continue;
      answered += 1;
      if (answer.correct) correct += 1;
    }
  }
  return { answered, accuracy: answered ? correct / answered : null };
}

export interface CoverageGap {
  catalogId: string;
  number: number;
  title: string;
  topic: string;
}

/** Modules taught by `week` (inclusive) that no bank has a question for. */
export function coverageGaps(banks: readonly Bank[], week: number): CoverageGap[] {
  const covered = new Set(banks.flatMap((bank) => bank.questions.map((question) => catalogIdForPracticeModule(question.moduleId))));
  const taught = new Set<string>();
  for (let number = 1; number <= week; number += 1) for (const id of weekCatalogIds(number)) taught.add(id);
  return [...taught]
    .filter((catalogId) => !covered.has(catalogId))
    .flatMap((catalogId) => {
      const reading = READING_INDEX.get(catalogId);
      return reading ? [{ catalogId, number: reading.number, title: reading.title, topic: reading.topic }] : [];
    })
    .sort((left, right) => left.number - right.number);
}
