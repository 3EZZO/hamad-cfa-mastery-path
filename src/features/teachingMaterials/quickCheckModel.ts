import { normalizeReadingTopic, READING_INDEX } from "../../data/readings";
import type { PracticeQuestion, PublishedPracticeBank } from "../../lib/practiceContent";
import { catalogIdForPracticeModule } from "../../lib/practiceLinks";

/**
 * Quick checks during PDF teaching use the existing, reviewed Practice bank:
 * questions for this session's curriculum modules, or else the topic being
 * taught. Results stay with the session summary; they never enter Hamad's
 * Practice history or mastery.
 */
export interface QuickCheckItem {
  key: string;
  bankTitle: string;
  topic: string;
  moduleNumber: number | null;
  question: PracticeQuestion;
}

export interface QuickCheckResult {
  key: string;
  chosen: number;
  correct: boolean;
}

type Bank = Pick<PublishedPracticeBank, "storageId" | "title" | "topic"> & { questions: readonly PracticeQuestion[] };

function itemsFor(banks: readonly Bank[]): QuickCheckItem[] {
  return banks.flatMap(bank => bank.questions.map(question => {
    const catalogId = catalogIdForPracticeModule(question.moduleId);
    const reading = catalogId ? READING_INDEX.get(catalogId) : undefined;
    return {
      key: `${bank.storageId}:${question.id}`,
      bankTitle: bank.title,
      topic: normalizeReadingTopic(reading?.topic ?? bank.topic),
      moduleNumber: reading?.number ?? null,
      question,
    };
  }));
}

/** Questions for the session's modules; if none, questions in the topic. */
export function quickCheckPool(banks: readonly Bank[], sessionModules: readonly number[], topic: string | null): { items: QuickCheckItem[]; scope: "modules" | "topic" | "none" } {
  const all = itemsFor(banks);
  const byModule = all.filter(item => item.moduleNumber !== null && sessionModules.includes(item.moduleNumber));
  if (byModule.length) return { items: byModule, scope: "modules" };
  const wanted = topic ? normalizeReadingTopic(topic) : null;
  const byTopic = wanted ? all.filter(item => item.topic === wanted) : [];
  return byTopic.length ? { items: byTopic, scope: "topic" } : { items: [], scope: "none" };
}

/** A question not yet asked in this sitting; asked ones repeat only when all were asked. */
export function nextQuickCheck(pool: readonly QuickCheckItem[], asked: ReadonlySet<string>, random: () => number = Math.random): QuickCheckItem | null {
  if (!pool.length) return null;
  const fresh = pool.filter(item => !asked.has(item.key));
  const from = fresh.length ? fresh : pool;
  return from[Math.min(from.length - 1, Math.floor(random() * from.length))]!;
}

export function quickCheckLine(results: readonly QuickCheckResult[]): string | undefined {
  if (!results.length) return undefined;
  const correct = results.filter(result => result.correct).length;
  return `Quick checks: ${correct} of ${results.length} correct.`;
}
