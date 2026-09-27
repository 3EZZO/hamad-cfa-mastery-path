import { EXAM_WEIGHTS, weightMidpoint, type CurriculumTopic, type ExamWeight } from "../data/examWeights";
import { getPlanTasks, getSessionTaskId, getWeekSessions, PLAN, TOPICS } from "../data/plan";
import { READING_CATALOG } from "../data/readings";
import type { TrackerState } from "../types";
import type { PracticeModuleInsight } from "./practiceInsights";
import { isTaskComplete } from "./taskStatus";

/**
 * Progress heatmap: every official curriculum module, grouped by topic and
 * ordered by exam weight, coloured by practice evidence. Practice banks use
 * their own module ids (`m004-tvm-valuation`); the `mNNN` prefix links them
 * to the catalog (`cfa-2027-outline-m004`). Banks without that prefix are
 * reported separately rather than guessed.
 */

export type HeatmapState = "none" | "new" | "repair" | "building" | "ready";

export interface HeatmapCell {
  catalogId: string;
  number: number;
  label: string;
  title: string;
  questionCount: number;
  attempted: number;
  correct: number;
  accuracy: number | null;
  due: number;
  lastAttemptedAt: string | null;
  /** Practised, but not in the last STALE_DAYS days. */
  stale: boolean;
  /** Assigned to a session the tutor has approved as complete. */
  taught: boolean;
  /** Practice-bank module ids behind this cell, weakest first. */
  practiceModuleIds: string[];
  state: HeatmapState;
}

export interface HeatmapRow {
  topic: CurriculumTopic;
  weight: ExamWeight;
  cells: HeatmapCell[];
  /** Modules with any practice attempt, of all the topic's modules. */
  practisedModules: number;
  taughtModules: number;
  accuracy: number | null;
}

export interface ModuleHeatmap {
  rows: HeatmapRow[];
  /** Practice modules that do not name a catalog module. */
  unmatched: PracticeModuleInsight[];
  /** Exam-weighted accuracy over topics with evidence; null without any. */
  weightedAccuracy: number | null;
}

export const STALE_DAYS = 14;
const DAY_MS = 86_400_000;
const CATALOG_PREFIX = "cfa-2027-outline-m";

export function catalogIdForPracticeModule(moduleId: string): string | null {
  const match = /^m(\d{3})(?:-|$)/i.exec(moduleId);
  return match ? `${CATALOG_PREFIX}${match[1]}` : null;
}

export function heatmapState(questionCount: number, attempted: number, accuracy: number | null): HeatmapState {
  if (!questionCount) return "none";
  if (!attempted || accuracy === null) return "new";
  if (accuracy >= 80) return "ready";
  if (accuracy >= 65) return "building";
  return "repair";
}

/** Catalog modules assigned to sessions the tutor has approved. */
export function taughtCatalogIds(tracker: TrackerState): Set<string> {
  const taught = new Set<string>();
  for (const week of PLAN) {
    const tasks = getPlanTasks(week, tracker.sessionOverrides);
    for (const session of getWeekSessions(week)) {
      const task = tasks.find((candidate) => candidate.id === getSessionTaskId(week, session));
      if (task && isTaskComplete(task, tracker)) session.readings?.forEach((id) => taught.add(id));
    }
  }
  return taught;
}

export function buildModuleHeatmap({
  modules,
  taught,
  now = new Date(),
}: {
  modules: PracticeModuleInsight[];
  taught: Set<string>;
  now?: Date;
}): ModuleHeatmap {
  const byCatalog = new Map<string, PracticeModuleInsight[]>();
  const unmatched: PracticeModuleInsight[] = [];
  const catalogIds = new Set(READING_CATALOG.readings.map((reading) => reading.id));
  for (const insight of modules) {
    const catalogId = catalogIdForPracticeModule(insight.moduleId);
    if (!catalogId || !catalogIds.has(catalogId)) {
      unmatched.push(insight);
      continue;
    }
    byCatalog.set(catalogId, [...(byCatalog.get(catalogId) ?? []), insight]);
  }

  const staleBefore = now.getTime() - STALE_DAYS * DAY_MS;
  const rows = TOPICS.map((topic): HeatmapRow => {
    const cells = READING_CATALOG.readings
      .filter((reading) => reading.topic === topic)
      .sort((left, right) => left.number - right.number)
      .map((reading): HeatmapCell => {
        const linked = byCatalog.get(reading.id) ?? [];
        const questionCount = linked.reduce((sum, item) => sum + item.questionCount, 0);
        const attempted = linked.reduce((sum, item) => sum + item.attempted, 0);
        const correct = linked.reduce((sum, item) => sum + item.correct, 0);
        const accuracy = attempted ? Math.round((correct / attempted) * 100) : null;
        const lastAttemptedAt = linked
          .map((item) => item.lastAttemptedAt)
          .filter((value): value is string => Boolean(value))
          .sort()
          .at(-1) ?? null;
        const lastMs = lastAttemptedAt ? Date.parse(lastAttemptedAt) : NaN;
        return {
          catalogId: reading.id,
          number: reading.number,
          label: `M${String(reading.number).padStart(3, "0")}`,
          title: reading.title,
          questionCount,
          attempted,
          correct,
          accuracy,
          due: linked.reduce((sum, item) => sum + item.due, 0),
          lastAttemptedAt,
          stale: Number.isFinite(lastMs) && lastMs < staleBefore,
          taught: taught.has(reading.id),
          // `modules` arrives weakest first (buildPracticeInsights), so the first id is the one to repair.
          practiceModuleIds: linked.map((item) => item.moduleId),
          state: heatmapState(questionCount, attempted, accuracy),
        };
      });
    const attempted = cells.reduce((sum, cell) => sum + cell.attempted, 0);
    const correct = cells.reduce((sum, cell) => sum + cell.correct, 0);
    return {
      topic,
      weight: EXAM_WEIGHTS[topic],
      cells,
      practisedModules: cells.filter((cell) => cell.attempted > 0).length,
      taughtModules: cells.filter((cell) => cell.taught).length,
      accuracy: attempted ? Math.round((correct / attempted) * 100) : null,
    };
  }).sort((left, right) =>
    weightMidpoint(right.topic) - weightMidpoint(left.topic)
    || TOPICS.indexOf(left.topic) - TOPICS.indexOf(right.topic));

  const withEvidence = rows.filter((row) => row.accuracy !== null);
  const totalWeight = withEvidence.reduce((sum, row) => sum + weightMidpoint(row.topic), 0);
  const weightedAccuracy = totalWeight
    ? Math.round(withEvidence.reduce((sum, row) => sum + (row.accuracy ?? 0) * weightMidpoint(row.topic), 0) / totalWeight)
    : null;

  return { rows, unmatched, weightedAccuracy };
}
