import type { MockKeyDoc } from "./mockTestContent";

/** Fewer questions than this in a group: show the counts, not a verdict. */
export const SMALL_SAMPLE = 4;

export interface BreakdownRow {
  id: string;
  total: number;
  answered: number;
  correct: number;
  /** Estimated time on these questions (papers record per-question time). */
  timeMs: number;
  smallSample: boolean;
}

export interface PaperBreakdown {
  byModule: BreakdownRow[];
  byCatalog: BreakdownRow[];
  bySkill: BreakdownRow[];
}

function group(
  ids: readonly string[] | undefined,
  answers: readonly (number | null)[],
  correct: readonly boolean[] | null,
  dwellMs: readonly number[] | undefined,
): BreakdownRow[] {
  if (!ids) return [];
  const rows = new Map<string, BreakdownRow>();
  ids.forEach((id, index) => {
    const row = rows.get(id) ?? { id, total: 0, answered: 0, correct: 0, timeMs: 0, smallSample: false };
    row.total += 1;
    if (answers[index] !== null && answers[index] !== undefined) row.answered += 1;
    if (correct?.[index]) row.correct += 1;
    row.timeMs += dwellMs?.[index] ?? 0;
    rows.set(id, row);
  });
  return [...rows.values()].map(row => ({ ...row, smallSample: row.total < SMALL_SAMPLE }));
}

/**
 * A paper's results grouped by the tags its key carries: the module test each
 * question exercises, the official 2027 curriculum module and the skill. A
 * test without tags (every module test) has no breakdown.
 */
export function paperBreakdown(
  key: Pick<MockKeyDoc, "modules" | "catalogIds" | "skills">,
  answers: readonly (number | null)[],
  correct: readonly boolean[] | null,
  dwellMs?: readonly number[],
): PaperBreakdown {
  const byId = (rows: BreakdownRow[]) => rows.sort((a, b) => a.id.localeCompare(b.id));
  return {
    byModule: byId(group(key.modules, answers, correct, dwellMs)),
    byCatalog: byId(group(key.catalogIds, answers, correct, dwellMs)),
    bySkill: group(key.skills, answers, correct, dwellMs).sort((a, b) => b.total - a.total),
  };
}

/** The weakest groups worth repairing: at least one miss, lowest share correct first. */
export function weakestRows(rows: readonly BreakdownRow[], limit = 3): BreakdownRow[] {
  return rows
    .filter(row => row.correct < row.total)
    .sort((a, b) => a.correct / a.total - b.correct / b.total || b.total - a.total)
    .slice(0, limit);
}
