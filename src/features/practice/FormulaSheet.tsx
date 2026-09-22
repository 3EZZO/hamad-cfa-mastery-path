import { ArrowLeft, Printer, Search, Sigma, X } from "lucide-react";
import { useMemo, useState } from "react";
import {
  countFormulae,
  filterFormulaSheet,
  type FormulaModuleGroup,
} from "../../lib/formulaSheet";

/**
 * Every formula the published banks teach, grouped by module. The banks are
 * already cached in IndexedDB for practice, so the sheet works offline; the
 * print styles in practiceCoach.css reduce it to a plain reference page.
 */
export function FormulaSheet({
  groups,
  onBack,
}: {
  groups: FormulaModuleGroup[];
  onBack: () => void;
}) {
  const [query, setQuery] = useState("");
  const visible = useMemo(() => filterFormulaSheet(groups, query), [groups, query]);
  const total = countFormulae(groups);
  const shown = countFormulae(visible);
  const print = () => {
    if (typeof window !== "undefined" && typeof window.print === "function") window.print();
  };

  return (
    <section className="practice-formula-sheet" aria-labelledby="formula-sheet-title">
      <header className="practice-formula-sheet__header">
        <button type="button" className="practice-formula-sheet__back" onClick={onBack}>
          <ArrowLeft size={18} aria-hidden="true" /> Practice
        </button>
        <div>
          <p className="practice-formula-sheet__eyebrow">Reference</p>
          <h2 id="formula-sheet-title">Formula sheet</h2>
          <p className="practice-formula-sheet__summary">
            {total === 1 ? "1 formula" : `${total} formulae`} across {groups.length}{" "}
            {groups.length === 1 ? "module" : "modules"}, taken from the assigned question banks.
          </p>
        </div>
        <button type="button" className="practice-formula-sheet__print" onClick={print}>
          <Printer size={17} aria-hidden="true" /> Print
        </button>
      </header>

      <div className="practice-formula-sheet__search">
        <Search size={17} aria-hidden="true" />
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search formulae, modules or topics"
          aria-label="Search formulae"
          autoComplete="off"
        />
        {query && (
          <button type="button" onClick={() => setQuery("")} aria-label="Clear search">
            <X size={16} aria-hidden="true" />
          </button>
        )}
      </div>
      <p className="practice-formula-sheet__count" role="status" aria-live="polite">
        {query ? `${shown} of ${total} shown` : ""}
      </p>

      {visible.length === 0 ? (
        <div className="practice-formula-sheet__empty">
          <Sigma aria-hidden="true" />
          <p>
            {total === 0
              ? "The assigned banks do not list any formulae yet."
              : "No formula matches that search."}
          </p>
        </div>
      ) : (
        visible.map((group) => (
          <article key={group.moduleId} className="practice-formula-sheet__module">
            <h3>
              <span>{group.topic}</span>
              {group.moduleTitle}
            </h3>
            <ol className="practice-formulae">
              {group.formulae.map((entry) => (
                <li key={entry.text}>
                  <code>{entry.text}</code>
                  <small>
                    {entry.questionCount === 1 ? "1 question" : `${entry.questionCount} questions`}
                  </small>
                </li>
              ))}
            </ol>
          </article>
        ))
      )}
    </section>
  );
}
