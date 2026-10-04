import { MOCK_MODULES, mockModuleCode, mockModulesForCatalog, type MockModule } from "../data/mockModules";
import { PLAN } from "../data/plan";
import { READING_INDEX } from "../data/readings";
import type { MockAttempt } from "./mockTestContent";
import { catalogIdForPracticeModule } from "./practiceLinks";
import { WEAK_SCORE } from "./testBoard";
import { weekCatalogIds } from "./weekTests";

/**
 * Student insights for Tutor Admin: where Hamad stands per curriculum module
 * (module test score blended with practice accuracy) and his pace against the
 * plan. Pure; the console supplies the data.
 */

export interface PracticeAnswerFact {
  /** Practice module id (e.g. `m014-fiscal`). */
  moduleId: string;
  correct: boolean;
  answeredAtMs: number;
}

export interface ModuleStanding {
  catalogId: string;
  label: string;
  /** The module test covering it, when there is one. */
  test: { id: string; code: string; score: number | null } | null;
  practiceAnswered: number;
  practiceAccuracy: number | null;
  /** 0–1 blend; lower is weaker. */
  strength: number;
  weak: boolean;
}

/** Practice counts toward a module's standing once this many questions are answered. */
export const PRACTICE_MIN_ANSWERS = 5;
const WEAK_STRENGTH = WEAK_SCORE / 8;

function catalogLabel(catalogId: string): string {
  const entry = READING_INDEX.get(catalogId);
  return entry ? `Module ${entry.number} · ${entry.title}` : catalogId;
}

/** Each curriculum module with any evidence, weakest first. */
export function moduleStandings(
  attempts: readonly MockAttempt[],
  answers: readonly PracticeAnswerFact[],
): ModuleStanding[] {
  const tests = new Map<string, { module: MockModule; score: number }>();
  for (const attempt of attempts) {
    if (attempt.status === "active" || attempt.score === null) continue;
    const module = MOCK_MODULES.find((candidate) => candidate.id === attempt.moduleId);
    if (!module) continue;
    for (const catalogId of module.catalogIds) tests.set(catalogId, { module, score: attempt.score });
  }
  const practice = new Map<string, { answered: number; correct: number }>();
  for (const answer of answers) {
    const catalogId = catalogIdForPracticeModule(answer.moduleId);
    if (!catalogId) continue;
    const entry = practice.get(catalogId) ?? { answered: 0, correct: 0 };
    entry.answered += 1;
    if (answer.correct) entry.correct += 1;
    practice.set(catalogId, entry);
  }
  const catalogIds = new Set([...tests.keys(), ...practice.keys()]);
  const standings: ModuleStanding[] = [];
  for (const catalogId of catalogIds) {
    const test = tests.get(catalogId);
    const done = practice.get(catalogId);
    const accuracy = done && done.answered ? done.correct / done.answered : null;
    const practiceCounts = done !== undefined && done.answered >= PRACTICE_MIN_ANSWERS;
    if (!test && !practiceCounts) continue;
    const testPart = test ? test.score / 8 : null;
    const strength = testPart !== null && practiceCounts
      ? 0.6 * testPart + 0.4 * accuracy!
      : testPart ?? accuracy!;
    standings.push({
      catalogId,
      label: catalogLabel(catalogId),
      test: test ? { id: test.module.id, code: mockModuleCode(test.module), score: test.score } : null,
      practiceAnswered: done?.answered ?? 0,
      practiceAccuracy: accuracy,
      strength,
      weak: strength < WEAK_STRENGTH,
    });
  }
  return standings.sort((left, right) => left.strength - right.strength || left.catalogId.localeCompare(right.catalogId));
}

export interface PaceReport {
  /** Plan week (1–25); 0 before the start. */
  week: number;
  /** Published tests whose plan week has started. */
  testsDue: string[];
  testsDone: number;
  /** Due and not yet taken. */
  testsBehind: string[];
  practiceThisWeek: number;
  practiceTarget: number;
  /** How far through the plan week today is (0–1). */
  weekElapsed: number;
  daysSinceLastPractice: number | null;
  daysToExam: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function localMidnight(day: string): number {
  const [year, month, date] = day.split("-").map(Number);
  return new Date(year!, month! - 1, date!).getTime();
}

export function paceReport(input: {
  week: number;
  nowMs: number;
  examDate: string;
  publishedTestIds: ReadonlySet<string>;
  attempts: readonly MockAttempt[];
  answers: readonly PracticeAnswerFact[];
}): PaceReport {
  const week = Math.max(0, Math.min(input.week, PLAN.length));
  const due = new Set<string>();
  for (let number = 1; number <= week; number += 1) {
    for (const module of mockModulesForCatalog(weekCatalogIds(number))) {
      if (input.publishedTestIds.has(module.id)) due.add(module.id);
    }
  }
  const taken = new Set(input.attempts.filter((attempt) => attempt.status !== "active").map((attempt) => attempt.moduleId));
  const testsDue = MOCK_MODULES.map((module) => module.id).filter((id) => due.has(id));
  const plan = week > 0 ? PLAN[week - 1] : undefined;
  const weekStart = plan ? localMidnight(plan.startDate) : input.nowMs;
  const last = input.answers.reduce((latest, answer) => Math.max(latest, answer.answeredAtMs), -Infinity);
  return {
    week,
    testsDue,
    testsDone: testsDue.filter((id) => taken.has(id)).length,
    testsBehind: testsDue.filter((id) => !taken.has(id)),
    practiceThisWeek: plan ? input.answers.filter((answer) => answer.answeredAtMs >= weekStart).length : 0,
    practiceTarget: plan?.questionTarget ?? 0,
    weekElapsed: plan ? Math.min(1, Math.max(0, (input.nowMs - weekStart) / (7 * DAY_MS))) : 0,
    daysSinceLastPractice: Number.isFinite(last) ? Math.floor((input.nowMs - last) / DAY_MS) : null,
    daysToExam: Math.max(0, Math.ceil((localMidnight(input.examDate) - input.nowMs) / DAY_MS)),
  };
}

export type InsightAction =
  | { type: "remind"; moduleIds: string[] }
  | { type: "open-practice" }
  | { type: "open-test"; moduleId: string };

export interface InsightSuggestion {
  id: string;
  text: string;
  action: InsightAction;
  actionLabel: string;
}

/** Practice a day behind the even pace before it counts as behind. */
const PRACTICE_SLACK = 1 / 7;
export const PRACTICE_IDLE_DAYS = 3;

export function suggestActions(pace: PaceReport, standings: readonly ModuleStanding[]): InsightSuggestion[] {
  const suggestions: InsightSuggestion[] = [];
  if (pace.testsBehind.length) {
    const codes = pace.testsBehind.map((id) => { const module = MOCK_MODULES.find((candidate) => candidate.id === id); return module ? mockModuleCode(module) : id; });
    suggestions.push({
      id: "tests-behind",
      text: `${pace.testsBehind.length} ${pace.testsBehind.length === 1 ? "test" : "tests"} from the plan not taken yet (${codes.join(", ")})`,
      action: { type: "remind", moduleIds: pace.testsBehind },
      actionLabel: "Send a reminder",
    });
  }
  const expected = Math.round(pace.practiceTarget * Math.max(0, pace.weekElapsed - PRACTICE_SLACK));
  if (pace.practiceTarget > 0 && pace.practiceThisWeek < expected) {
    suggestions.push({
      id: "practice-behind",
      text: `Practice behind this week: ${pace.practiceThisWeek} of ${pace.practiceTarget} questions (about ${expected} expected by now)`,
      action: { type: "open-practice" },
      actionLabel: "Open practice",
    });
  } else if (pace.daysSinceLastPractice !== null && pace.daysSinceLastPractice >= PRACTICE_IDLE_DAYS) {
    suggestions.push({
      id: "practice-idle",
      text: `No practice for ${pace.daysSinceLastPractice} days`,
      action: { type: "open-practice" },
      actionLabel: "Open practice",
    });
  }
  for (const standing of standings.filter((entry) => entry.weak).slice(0, 2)) {
    suggestions.push({
      id: `weak-${standing.catalogId}`,
      text: `Weak: ${standing.label}`,
      action: standing.test ? { type: "open-test", moduleId: standing.test.id } : { type: "open-practice" },
      actionLabel: standing.test ? `Review ${standing.test.code}` : "Open practice",
    });
  }
  return suggestions;
}
