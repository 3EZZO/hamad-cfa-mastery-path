import { Calculator, CheckCircle2, CircleAlert, ListChecks, RefreshCw, X } from "lucide-react";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { useDialogFocus } from "../liveSession/useDialogFocus";
import { nextQuickCheck, type QuickCheckItem, type QuickCheckResult } from "./quickCheckModel";

const LETTERS = ["A", "B", "C"];

/** Reading-specific check; results belong only to this teaching session. */
export function QuickCheck({ active, modal, pdfLabel, loading, error, pool, scope, moduleNumbers, results, onResult, onRetry, onClose, calculator, onCalculatorToggle }: {
  active: boolean;
  modal: boolean;
  pdfLabel: string;
  loading: boolean;
  error: string;
  pool: readonly QuickCheckItem[];
  scope: "reading" | "none";
  moduleNumbers: readonly number[];
  results: readonly QuickCheckResult[];
  onResult: (result: QuickCheckResult) => void;
  onRetry: () => void;
  onClose: () => void;
  calculator?: ReactNode;
  onCalculatorToggle?: () => void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const titleId = useId();
  const [current, setCurrent] = useState<QuickCheckItem | null>(null);
  const [chosen, setChosen] = useState<number | null>(null);
  useDialogFocus(active && modal, dialogRef, headingRef, onClose);
  useEffect(() => { if (active && !modal) headingRef.current?.focus(); }, [active, modal]);

  const asked = new Set(results.map(result => result.key));
  const candidate = current && pool.find(item => item.key === current.key);
  const item = loading || error ? null : candidate || nextQuickCheck(pool, asked);
  if (item !== current) { setCurrent(item); setChosen(null); }
  const question = item?.question;
  const correctCount = results.filter(result => result.correct).length;

  const another = () => {
    setChosen(null);
    setCurrent(nextQuickCheck(pool, new Set([...asked, ...(item ? [item.key] : [])])));
    headingRef.current?.focus();
  };

  return (
    <div ref={dialogRef} className="tm-check" role={modal ? "dialog" : "region"} aria-modal={modal ? true : undefined} aria-labelledby={titleId} tabIndex={-1}
      onKeyDownCapture={event => {
        if (event.key !== "Escape") return;
        event.preventDefault();
        event.stopPropagation();
        onClose();
      }}>
      <header className="tm-check__head">
        <h2 id={titleId} ref={headingRef} tabIndex={-1}><ListChecks size={18} aria-hidden="true" /> Quick check</h2>
        {onCalculatorToggle && <button type="button" className="tm-icon" onClick={onCalculatorToggle} aria-pressed={!!calculator} aria-label={calculator ? "Hide quick check calculator" : "Show quick check calculator"}><Calculator size={18} aria-hidden="true" /></button>}
        <button type="button" className="tm-icon" onClick={onClose} aria-label="Back to the PDF"><X size={18} aria-hidden="true" /></button>
      </header>
      <div className="tm-check__body">
        <div className="tm-check__context">
          <strong>{pdfLabel}</strong>
          <span>{moduleNumbers.length ? `Curriculum ${moduleNumbers.length === 1 ? "module" : "modules"} ${moduleNumbers.join(", ")}` : "PDF curriculum mapping unavailable"}</span>
          {results.length > 0 && <span className="tm-check__score">Session checks: {correctCount} of {results.length} correct</span>}
        </div>
        {loading ? (
          <p className="tm-state" role="status"><RefreshCw className="tm-spin" size={18} aria-hidden="true" /> Loading the question bank...</p>
        ) : error ? (
          <div role="alert" className="tm-check__empty">
            <p>{error}</p>
            <button type="button" className="tm-button" onClick={onRetry}><RefreshCw size={15} aria-hidden="true" /> Try again</button>
          </div>
        ) : !question || scope === "none" ? (
          <div className="tm-check__empty">
            <h3>{scope === "none" ? "This PDF needs a curriculum match" : "No matching questions available yet"}</h3>
            <p>{scope === "none" ? "The PDF title and topic do not identify one supported curriculum mapping. Check its library labels before trying again." : "The published Practice bank has no questions for this PDF's mapped curriculum modules."}</p>
          </div>
        ) : (
          <>
            <h3 className="tm-check__prompt">{question.prompt}</h3>
            <div className="tm-check__options" role="group" aria-label={chosen === null ? "Tap Hamad's answer" : "Answer choices"}>
              {question.options.map((option, index) => {
                const state = chosen === null ? "" : index === question.correctOption ? " is-correct" : index === chosen ? " is-wrong" : " is-other";
                return (
                  <button key={index} type="button" className={`tm-check__option${state}`} disabled={chosen !== null}
                    aria-pressed={chosen === index}
                    onClick={() => {
                      setChosen(index);
                      onResult({ key: item!.key, chosen: index, correct: index === question.correctOption });
                    }}>
                    <span className="tm-check__letter">{LETTERS[index]}</span>
                    <span>{option}</span>
                  </button>
                );
              })}
            </div>
            {chosen === null ? <p className="tm-check__hint">Hamad answers aloud; tap his choice to show the answer.</p> : (
              <div className="tm-check__answer" role="status">
                <strong>{chosen === question.correctOption ? <><CheckCircle2 size={18} aria-hidden="true" /> Correct</> : <><CircleAlert size={18} aria-hidden="true" /> The answer is {LETTERS[question.correctOption]}</>}</strong>
                <p>{question.explanation}</p>
                {question.working.length > 0 && <ol className="financial-working">{question.working.map(step => <li key={step}>{step}</li>)}</ol>}
                {question.formulae.length > 0 && <div className="tm-check__formulae">{question.formulae.map(formula => <code key={formula} className="financial-expression">{formula}</code>)}</div>}
              </div>
            )}
          </>
        )}
        {calculator && <div className="tm-check__calculator" role="group" aria-label="Quick check calculator">{calculator}</div>}
      </div>
      <footer className="tm-check__actions">
        <button type="button" className="tm-button" onClick={onClose}>Back to the PDF</button>
        <button type="button" className="tm-button tm-button--primary" onClick={another} disabled={!question || chosen === null || loading || !!error}>Another question</button>
      </footer>
    </div>
  );
}
