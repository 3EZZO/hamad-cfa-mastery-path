import { mockModuleById, mockModuleCode } from "../../data/mockModules";
import { READING_INDEX } from "../../data/readings";
import type { MockKeyDoc } from "../../lib/mockTestContent";
import { paperBreakdown, weakestRows, type BreakdownRow } from "../../lib/paperBreakdown";

function minutes(ms: number): string {
  return `${Math.round(ms / 60_000)} min`;
}

function moduleName(id: string): string {
  const module = mockModuleById(id);
  return module ? `${mockModuleCode(module)} · ${module.title}` : id;
}

function catalogName(id: string): string {
  return READING_INDEX.get(id)?.title ?? id;
}

const SKILL_LABEL: Record<string, string> = {
  calculation: "Calculation",
  concept: "Concept",
  interpretation: "Interpretation",
  trap: "Exam trap",
};

/** A paper's results by module test, official 2027 module and skill. */
export function PaperBreakdownView({
  keyDoc,
  answers,
  correct,
  dwellMs,
  onPractise,
}: {
  keyDoc: Pick<MockKeyDoc, "modules" | "catalogIds" | "skills">;
  answers: readonly (number | null)[];
  correct: readonly boolean[] | null;
  dwellMs?: readonly number[];
  onPractise?: (moduleId: string) => void;
}) {
  const breakdown = paperBreakdown(keyDoc, answers, correct, dwellMs);
  if (breakdown.byModule.length === 0) return null;
  const weakest = weakestRows(breakdown.byModule);
  const row = (item: BreakdownRow, label: string) => (
    <tr key={item.id}>
      <th scope="row">{label}</th>
      <td className="is-num">{item.correct} / {item.total}</td>
      <td className="is-num">{item.answered} / {item.total}</td>
      {dwellMs && <td className="is-num">{minutes(item.timeMs)}</td>}
      <td>{item.smallSample ? <span className="mock-status mock-status--draft">Small sample</span> : `${Math.round((item.correct / item.total) * 100)}%`}</td>
    </tr>
  );
  const table = (caption: string, rows: BreakdownRow[], label: (id: string) => string) => (
    <div className="mock-table-wrap">
      <table className="mock-table mock-breakdown__table">
        <caption>{caption}</caption>
        <thead>
          <tr><th scope="col">Group</th><th scope="col" className="is-num">Correct</th><th scope="col" className="is-num">Answered</th>{dwellMs && <th scope="col" className="is-num">Time (est.)</th>}<th scope="col">Share</th></tr>
        </thead>
        <tbody>{rows.map(item => row(item, label(item.id)))}</tbody>
      </table>
    </div>
  );
  return (
    <section className="mock-breakdown" aria-labelledby="mock-breakdown-title">
      <h3 id="mock-breakdown-title">Results by module</h3>
      <p className="mock-breakdown__note">
        Counts first: a module with fewer than four questions on this paper is a small sample, not a verdict. Time per question is an estimate.
      </p>
      {weakest.length > 0 && (
        <ul className="mock-breakdown__weak" aria-label="Repair first">
          {weakest.map(item => (
            <li key={item.id}>
              <span><strong>{moduleName(item.id)}</strong> · {item.correct} of {item.total}</span>
              {onPractise && <button type="button" className="mock-button mock-button--ghost" onClick={() => onPractise(item.id)}>Practise</button>}
            </li>
          ))}
        </ul>
      )}
      {table("Module tests", breakdown.byModule, moduleName)}
      <details className="mock-breakdown__more">
        <summary>Official 2027 modules and skills</summary>
        {table("Official 2027 curriculum modules", breakdown.byCatalog, catalogName)}
        {table("Skills", breakdown.bySkill, id => SKILL_LABEL[id] ?? id)}
      </details>
    </section>
  );
}
