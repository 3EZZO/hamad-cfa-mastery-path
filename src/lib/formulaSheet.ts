import { READING_CATALOG } from "../data/readings";
import { TOPICS } from "../data/plan";
import type { PracticeQuestion } from "./practiceContent";

/** One formula as it appears on the sheet, with how many questions cite it. */
export interface FormulaEntry {
  text: string;
  questionCount: number;
}

export interface FormulaModuleGroup {
  topic: string;
  moduleId: string;
  moduleTitle: string;
  formulae: FormulaEntry[];
}

interface FormulaBankLike {
  topic: string;
  questions: PracticeQuestion[];
}

/** Collapses whitespace so the same formula typed two ways counts once. */
function canonical(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/**
 * Human title for a bank module id such as `m010-regression`: the official
 * outline module of the same number, else the id itself. Ids that carry no
 * module number are shown as authored.
 */
export function moduleTitle(moduleId: string): string {
  const number = /(?:^|[^0-9])m(\d{3})(?:$|[^0-9])/i.exec(moduleId)?.[1];
  if (!number) return moduleId;
  const reading = READING_CATALOG.readings.find(
    (entry) => entry.number === Number(number),
  );
  return reading ? `M${number} · ${reading.title}` : moduleId;
}

function topicRank(topic: string): number {
  const index = (TOPICS as readonly string[]).indexOf(topic);
  return index < 0 ? TOPICS.length : index;
}

/**
 * Every distinct formula in the published banks, grouped by topic and
 * module. Modules follow the curriculum topic order, then their id; within a
 * module the formulae cited by more questions come first.
 */
export function buildFormulaSheet(banks: FormulaBankLike[]): FormulaModuleGroup[] {
  const modules = new Map<string, { topic: string; counts: Map<string, number> }>();
  for (const bank of banks) {
    for (const question of bank.questions) {
      const seenInQuestion = new Set<string>();
      for (const raw of question.formulae) {
        const text = canonical(raw);
        if (!text || seenInQuestion.has(text)) continue;
        seenInQuestion.add(text);
        let entry = modules.get(question.moduleId);
        if (!entry) {
          entry = { topic: bank.topic, counts: new Map() };
          modules.set(question.moduleId, entry);
        }
        entry.counts.set(text, (entry.counts.get(text) ?? 0) + 1);
      }
    }
  }
  return [...modules.entries()]
    .map(([moduleId, entry]) => ({
      topic: entry.topic,
      moduleId,
      moduleTitle: moduleTitle(moduleId),
      formulae: [...entry.counts.entries()]
        .map(([text, questionCount]) => ({ text, questionCount }))
        .sort((a, b) => b.questionCount - a.questionCount || a.text.localeCompare(b.text)),
    }))
    .sort(
      (a, b) =>
        topicRank(a.topic) - topicRank(b.topic) ||
        a.topic.localeCompare(b.topic) ||
        a.moduleId.localeCompare(b.moduleId),
    );
}

/** Case-insensitive match on formula text, module title or topic; empty query keeps all. */
export function filterFormulaSheet(
  groups: FormulaModuleGroup[],
  query: string,
): FormulaModuleGroup[] {
  const needle = canonical(query).toLowerCase();
  if (!needle) return groups;
  return groups.flatMap((group) => {
    const groupMatches =
      group.moduleTitle.toLowerCase().includes(needle) ||
      group.topic.toLowerCase().includes(needle);
    const formulae = groupMatches
      ? group.formulae
      : group.formulae.filter((entry) => entry.text.toLowerCase().includes(needle));
    return formulae.length ? [{ ...group, formulae }] : [];
  });
}

export function countFormulae(groups: FormulaModuleGroup[]): number {
  return groups.reduce((sum, group) => sum + group.formulae.length, 0);
}
