import { CheckCircle2, CircleAlert, ListChecks, RefreshCw, X } from "lucide-react";
import { useRef, useState } from "react";
import { useDialogFocus } from "../liveSession/useDialogFocus";
import { nextQuickCheck, type QuickCheckItem, type QuickCheckResult } from "./quickCheckModel";

const LETTERS = ["A", "B", "C"];

/**
 * One question on the shared screen: Hamad answers aloud, the tutor taps his
 * choice, then the key and explanation appear. Results go to the session
 * summary only.
 */
export function QuickCheck({ active, loading, error, pool, scope, results, onResult, onRetry, onClose }: {
  active: boolean;
  loading: boolean;
  error: string;
  pool: readonly QuickCheckItem[];
  scope: "modules" | "topic" | "none";
  results: readonly QuickCheckResult[];
  onResult: (result: QuickCheckResult) => void;
  onRetry: () => void;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [current, setCurrent] = useState<QuickCheckItem | null>(null);
  const [chosen, setChosen] = useState<number | null>(null);
  useDialogFocus(active, dialogRef, headingRef, onClose);

  const asked = new Set(results.map(result => result.key));
  const item = current ?? (loading || error ? null : nextQuickCheck(pool, asked));
  if (!current && item) setCurrent(item);
  const question = item?.question;
  const correctCount = results.filter(result => result.correct).length;

  const another = () => {
    setChosen(null);
    setCurrent(nextQuickCheck(pool, new Set([...asked, ...(item ? [item.key] : [])])));
    headingRef.current?.focus();
  };

  return (
    <div className="tm-check-backdrop">
      <div ref={dialogRef} className="tm-check" role="dialog" aria-modal="true" aria-labelledby="tm-check-title" tabIndex={-1}>
        <div className="tm-check__head">
          <span><ListChecks size={18} aria-hidden="true" /> Quick check{item ? ` · ${item.moduleNumber !== null ? `Module ${item.moduleNumber} · ` : ""}${item.topic}` : ""}</span>
          <span className="tm-check__score">{results.length ? `${correctCount} of ${results.length} correct` : ""}</span>
          <button type="button" className="tm-icon" onClick={onClose} aria-label="Back to the PDF"><X size={18} aria-hidden="true" /></button>
        </div>
        {loading ? (
          <p className="tm-state" role="status"><RefreshCw className="tm-spin" size={18} aria-hidden="true" /> Loading the question bank…</p>
        ) : error ? (
          <div role="alert" className="tm-check__empty">
            <p>{error}</p>
            <button type="button" className="tm-button" onClick={onRetry}><RefreshCw size={15} aria-hidden="true" /> Try again</button>
          </div>
        ) : !question || scope === "none" ? (
          <div className="tm-check__empty">
            <h2 id="tm-check-title" ref={headingRef} tabIndex={-1}>No questions for this topic yet</h2>
            <p>The Practice bank has no questions for this session’s modules or this PDF’s topic. Nothing unrelated is shown.</p>
          </div>
        ) : (
          <>
            <h2 id="tm-check-title" ref={headingRef} tabIndex={-1} className="tm-check__prompt">{question.prompt}</h2>
            <div className="tm-check__options" role="group" aria-label={chosen === null ? "Tap Hamad’s answer" : "Answer choices"}>
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
            {chosen === null ? (
              <p className="tm-check__hint">Hamad answers aloud; tap his choice to show the answer.</p>
            ) : (
              <div className="tm-check__answer" role="status">
                <strong>{chosen === question.correctOption
                  ? <><CheckCircle2 size={18} aria-hidden="true" /> Correct</>
                  : <><CircleAlert size={18} aria-hidden="true" /> The answer is {LETTERS[question.correctOption]}</>}</strong>
                <p>{question.explanation}</p>
                {question.working.length > 0 && <ol className="financial-working">{question.working.map(step => <li key={step}>{step}</li>)}</ol>}
                {question.formulae.length > 0 && <div className="tm-check__formulae">{question.formulae.map(formula => <code key={formula} className="financial-expression">{formula}</code>)}</div>}
              </div>
            )}
            <div className="tm-check__actions">
              <button type="button" className="tm-button" onClick={onClose}>Back to the PDF</button>
              <button type="button" className="tm-button tm-button--primary" onClick={another} disabled={chosen === null}>Another question</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
