import { normalizeReadingTopic, READING_CATALOG, READING_INDEX } from "../../data/readings";
import { MOCK_MODULES } from "../../data/mockModules";
import type { PracticeQuestion, PublishedPracticeBank } from "../../lib/practiceContent";
import { catalogIdForPracticeModule } from "../../lib/practiceLinks";

/**
 * Quick checks during PDF teaching use the existing, reviewed Practice bank:
 * questions explicitly mapped to the open PDF. Results stay with the session
 * summary; they never enter Hamad's
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

export interface QuickCheckPdf {
  title: string;
  topic: string;
}

// Known upload names for the existing owner-approved test/catalog mapping.
const PDF_ALIASES: Readonly<Record<string, readonly string[]>> = {
  "e01-firm-and-market-structures": ["Firms and Market Structure", "Firms and Market Structures"],
  "e02-understanding-business-cycles": ["Understanding Business Cycle"],
};

function titleKey(title: string, topic: string): string {
  let words = title.toLowerCase().replace(/\.pdf$/i, "")
    .replace(/\b(?:reading|module)\s*\d+\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ").trim();
  const topicWords = topic.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  // Remove only complete subject labels, never fuzzy-match part of a title.
  words = ` ${words} `.replace(` ${topicWords} `, " ").replace(/\b(?:finquiz|qm)\b/g, " ");
  return words.replace(/\s+/g, " ").trim().replace(/^the /, "");
}

/** Resolve titles, not PDF reading numbers (a different numbering system). */
export function quickCheckCatalogIds(pdf: QuickCheckPdf): readonly string[] {
  const topic = normalizeReadingTopic(pdf.topic);
  const key = titleKey(pdf.title, topic);
  if (!key) return [];
  const candidates: readonly string[][] = [
    ...MOCK_MODULES.filter(module => module.topic === topic &&
      [module.title, ...(PDF_ALIASES[module.id] ?? [])].some(title => titleKey(title, topic) === key))
      .map(module => [...module.catalogIds]),
    ...READING_CATALOG.readings.filter(reading => normalizeReadingTopic(reading.topic) === topic && titleKey(reading.title, topic) === key)
      .map(reading => [reading.id]),
  ];
  const mappings = new Map(candidates.map(ids => [ids.slice().sort().join(","), ids]));
  return mappings.size === 1 ? [...mappings.values()][0]! : [];
}

/** No session-wide or topic-wide fallback: an empty match stays empty. */
export function quickCheckPool(banks: readonly Bank[], pdf: QuickCheckPdf): { items: QuickCheckItem[]; scope: "reading" | "none"; moduleNumbers: number[] } {
  const catalogIds = quickCheckCatalogIds(pdf);
  const wanted = new Set(catalogIds);
  const items = itemsFor(banks).filter(item => {
    const catalogId = catalogIdForPracticeModule(item.question.moduleId);
    return catalogId !== null && wanted.has(catalogId);
  });
  return {
    items,
    scope: catalogIds.length ? "reading" : "none",
    moduleNumbers: catalogIds.flatMap(id => { const reading = READING_INDEX.get(id); return reading ? [reading.number] : []; }),
  };
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
