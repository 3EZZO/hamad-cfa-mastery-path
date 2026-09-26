import { Calculator, ChevronLeft, ChevronRight, CircleAlert, CloudOff, Flag, LogOut, Maximize, Send, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { defaultTVMState } from "../../lib/calculator";
import type { MockWork } from "../../lib/cloudMockTests";
import {
  appendIncident,
  appendKeystroke,
  incidentLabel,
  mockRemainingMs,
  optionLetter,
  type MockAnswer,
  type MockFinishReason,
  type MockIncidentType,
  type MockQuestion,
} from "../../lib/mockTestContent";
import { useDialogFocus } from "../liveSession/useDialogFocus";
import { BA2Plus, type KeystrokeLog } from "../practice/BA2Plus";
import { MockTimer } from "./MockTimer";
import { enterFullscreen, exitFullscreen, fullscreenSupported, useExamLock } from "./useExamLock";

type Confirm = null | "submit" | "leave";
type SaveState = "saved" | "saving" | "offline";

export interface MockTestRunnerProps {
  moduleLabel: string;
  questions: MockQuestion[];
  startedAtMs: number;
  serverOffsetMs: number;
  initialWork: MockWork;
  rehearsal?: boolean;
  onSave: (work: MockWork) => Promise<void>;
  onFinish: (reason: Exclude<MockFinishReason, "expired">, work: MockWork) => Promise<void>;
}

export function MockTestRunner({
  moduleLabel,
  questions,
  startedAtMs,
  serverOffsetMs,
  initialWork,
  rehearsal = false,
  onSave,
  onFinish,
}: MockTestRunnerProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [work, setWork] = useState<MockWork>(initialWork);
  const workRef = useRef(work);
  workRef.current = work;
  const [index, setIndex] = useState(() => {
    const firstOpen = initialWork.answers.findIndex(answer => answer === null);
    return firstOpen < 0 ? 0 : firstOpen;
  });
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [calculatorOpen, setCalculatorOpen] = useState(false);
  const [tvmState, setTvmState] = useState(defaultTVMState);
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [finishing, setFinishing] = useState(false);
  const [finishError, setFinishError] = useState("");
  const finishingRef = useRef(false);
  const dirty = useRef(false);

  const serverNow = () => Date.now() + serverOffsetMs;
  const remainingMs = mockRemainingMs(startedAtMs, nowMs, serverOffsetMs);

  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, []);

  const update = useCallback((change: (current: MockWork) => MockWork) => {
    dirty.current = true;
    setWork(current => change(current));
  }, []);

  const onIncident = useCallback((type: MockIncidentType) => {
    update(current => ({
      ...current,
      incidents: appendIncident(current.incidents, {
        type,
        atClient: new Date().toISOString(),
        elapsedMs: Math.max(0, Date.now() + serverOffsetMs - startedAtMs),
      }),
    }));
  }, [serverOffsetMs, startedAtMs, update]);

  const { warning, returnToExam, dismissWarning } = useExamLock({
    active: !finishing,
    onIncident,
  });
  const confirmRef = useRef<HTMLDivElement>(null);
  const confirmSafeRef = useRef<HTMLButtonElement>(null);
  const warningRef = useRef<HTMLDivElement>(null);
  const warningActionRef = useRef<HTMLButtonElement>(null);
  const showWarning = Boolean(warning && !confirm && !finishing);
  useDialogFocus(Boolean(confirm), confirmRef, confirmSafeRef, () => setConfirm(null));
  useDialogFocus(showWarning, warningRef, warningActionRef, dismissWarning);

  // Autosave shortly after every change; keep retrying while offline.
  useEffect(() => {
    if (!dirty.current || finishingRef.current) return;
    setSaveState("saving");
    const timer = window.setTimeout(async () => {
      try {
        await onSave(workRef.current);
        if (!finishingRef.current) setSaveState("saved");
        dirty.current = false;
      } catch {
        setSaveState("offline");
      }
    }, 700);
    return () => window.clearTimeout(timer);
  }, [work, onSave]);

  useEffect(() => {
    if (saveState !== "offline") return;
    const retry = window.setInterval(async () => {
      try {
        await onSave(workRef.current);
        dirty.current = false;
        setSaveState("saved");
      } catch {
        // Still offline; the deadline is enforced by the server either way.
      }
    }, 5000);
    return () => window.clearInterval(retry);
  }, [saveState, onSave]);

  const finish = useCallback(async (reason: Exclude<MockFinishReason, "expired">) => {
    if (finishingRef.current) return;
    finishingRef.current = true;
    setFinishing(true);
    setConfirm(null);
    setCalculatorOpen(false);
    setFinishError("");
    try {
      await onFinish(reason, workRef.current);
      await exitFullscreen();
    } catch (error) {
      finishingRef.current = false;
      setFinishing(false);
      setFinishError(error instanceof Error ? error.message : "Could not reach the server. Check your connection and try again.");
    }
  }, [onFinish]);

  // 00:00 submits whatever is selected.
  useEffect(() => {
    if (remainingMs <= 0 && !finishingRef.current) void finish("timeout");
  }, [remainingMs, finish]);

  const question = questions[index]!;
  const answered = work.answers.filter(answer => answer !== null).length;
  const unanswered = questions.length - answered;

  const choose = (option: MockAnswer) => update(current => {
    const answers = [...current.answers];
    answers[index] = option;
    return { ...current, answers };
  });
  const toggleFlag = () => update(current => {
    const flags = [...current.flags];
    flags[index] = !flags[index];
    return { ...current, flags };
  });
  const go = (next: number) => setIndex(Math.max(0, Math.min(questions.length - 1, next)));

  const onCalculatorLog = (log: KeystrokeLog) => update(current => ({
    ...current,
    keystrokes: appendKeystroke(current.keystrokes, {
      q: index,
      key: log.key.slice(0, 16),
      display: String(log.display).slice(0, 24),
      t: Math.max(0, serverNow() - startedAtMs),
      registers: { ...log.registers },
    }),
  }));

  // Keyboard: A/B/C or 1/2/3 answer, arrows move, F flags. Off while typing in the calculator.
  useEffect(() => {
    if (calculatorOpen || confirm || warning || finishing) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      const key = event.key.toLowerCase();
      const pick = { a: 0, b: 1, c: 2, "1": 0, "2": 1, "3": 2 }[key] as MockAnswer | undefined;
      if (pick !== undefined) { event.preventDefault(); choose(pick); return; }
      if (key === "arrowright") { event.preventDefault(); go(index + 1); }
      if (key === "arrowleft") { event.preventDefault(); go(index - 1); }
      if (key === "f") { event.preventDefault(); toggleFlag(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const content = (
    <div ref={rootRef} className="mock-exam" role="application" aria-label={`${moduleLabel} mock test`}>
      <header className="mock-exam__bar">
        <div className="mock-exam__identity">
          <span>{rehearsal ? "Rehearsal · nothing is saved" : "Module mock test"}</span>
          <strong>{moduleLabel}</strong>
        </div>
        <MockTimer remainingMs={remainingMs} />
        <div className="mock-exam__tools">
          <span className={`mock-save mock-save--${saveState}`} role="status">
            {saveState === "offline" ? <><CloudOff size={15} />Reconnecting…</> : saveState === "saving" ? "Saving…" : "Saved"}
          </span>
          <button type="button" className="mock-tool" onClick={() => setCalculatorOpen(open => !open)} aria-pressed={calculatorOpen}>
            <Calculator size={18} /><span>Calculator</span>
          </button>
          <button type="button" className="mock-tool mock-tool--leave" onClick={() => setConfirm("leave")} disabled={finishing}>
            <LogOut size={18} /><span>Leave Test</span>
          </button>
        </div>
      </header>

      <div className="mock-exam__layout">
        <nav className="mock-nav" aria-label="Questions">
          <p className="mock-nav__summary">{answered} of {questions.length} answered</p>
          <ol>
            {questions.map((item, position) => {
              const isAnswered = work.answers[position] !== null;
              const isFlagged = work.flags[position];
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    className={[
                      "mock-nav__chip",
                      position === index && "is-current",
                      isAnswered && "is-answered",
                      isFlagged && "is-flagged",
                    ].filter(Boolean).join(" ")}
                    aria-current={position === index ? "step" : undefined}
                    aria-label={`Question ${position + 1}, ${isAnswered ? `answered ${optionLetter(work.answers[position])}` : "unanswered"}${isFlagged ? ", flagged" : ""}`}
                    onClick={() => go(position)}
                  >
                    {position + 1}
                    {isFlagged && <Flag size={11} aria-hidden="true" />}
                  </button>
                </li>
              );
            })}
          </ol>
          <div className="mock-nav__legend" aria-hidden="true">
            <span><i className="is-answered" />Answered</span>
            <span><i />Unanswered</span>
            <span><i className="is-flagged" />Flagged</span>
          </div>
        </nav>

        <main className="mock-question" key={question.id}>
          <p className="mock-question__count">Question {index + 1} of {questions.length}</p>
          <div className="mock-question__stem">{question.stem}</div>
          {question.table && (
            <div className="mock-table-wrap">
              <table className="mock-table">
                {question.table.caption && <caption>{question.table.caption}</caption>}
                <thead>
                  <tr>{question.table.headers.map((header, column) => <th key={column} scope="col">{header}</th>)}</tr>
                </thead>
                <tbody>
                  {question.table.rows.map((row, rowIndex) => (
                    <tr key={rowIndex}>
                      {row.cells.map((cell, column) => column === 0
                        ? <th key={column} scope="row">{cell}</th>
                        : <td key={column}>{cell}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <fieldset className="mock-options">
            <legend className="visually-hidden">Choose one answer</legend>
            {question.options.map((text, option) => {
              const selected = work.answers[index] === option;
              return (
                <label key={option} className={`mock-option${selected ? " is-selected" : ""}`}>
                  <input
                    type="radio"
                    name={`mock-${question.id}`}
                    checked={selected}
                    onChange={() => choose(option as MockAnswer)}
                  />
                  <span className="mock-option__letter">{optionLetter(option)}</span>
                  <span className="mock-option__text">{text}</span>
                </label>
              );
            })}
          </fieldset>
          <div className="mock-question__actions">
            <button type="button" className="mock-button mock-button--ghost" onClick={() => go(index - 1)} disabled={index === 0}>
              <ChevronLeft size={18} />Previous
            </button>
            <button type="button" className={`mock-button mock-button--flag${work.flags[index] ? " is-on" : ""}`} onClick={toggleFlag} aria-pressed={work.flags[index]}>
              <Flag size={16} />{work.flags[index] ? "Flagged" : "Flag for review"}
            </button>
            {index < questions.length - 1 ? (
              <button type="button" className="mock-button mock-button--primary" onClick={() => go(index + 1)}>
                Next<ChevronRight size={18} />
              </button>
            ) : (
              <button type="button" className="mock-button mock-button--primary" onClick={() => setConfirm("submit")} disabled={finishing}>
                <Send size={16} />Review &amp; submit
              </button>
            )}
          </div>
          {index < questions.length - 1 && (
            <button type="button" className="mock-submit-early" onClick={() => setConfirm("submit")} disabled={finishing}>
              Submit test
            </button>
          )}
          {finishError && <p className="mock-error" role="alert"><CircleAlert size={16} />{finishError}</p>}
        </main>
      </div>

      {calculatorOpen && (
        <aside className="mock-calculator" aria-label="BA II Plus calculator">
          <div className="mock-calculator__head">
            <strong>BA II Plus</strong>
            <button type="button" className="mock-icon" aria-label="Close calculator" onClick={() => setCalculatorOpen(false)}><X size={18} /></button>
          </div>
          <BA2Plus onLog={onCalculatorLog} startTime={startedAtMs} tvmState={tvmState} onStateChange={setTvmState} />
        </aside>
      )}

      {confirm && (
        <div className="mock-modal" role="presentation">
          <div ref={confirmRef} className="mock-modal__card" role="alertdialog" aria-modal="true" aria-labelledby="mock-confirm-title">
            {confirm === "submit" ? (
              <>
                <h2 id="mock-confirm-title">Submit your test?</h2>
                {unanswered > 0 ? (
                  <p className="mock-modal__warn"><CircleAlert size={18} />{unanswered} {unanswered === 1 ? "question is" : "questions are"} unanswered and will be marked wrong.</p>
                ) : (
                  <p>All {questions.length} questions are answered.</p>
                )}
                {work.flags.some(Boolean) && <p>You still have {work.flags.filter(Boolean).length} flagged for review.</p>}
                <p>You cannot change your answers after submitting.</p>
                <div className="mock-modal__actions">
                  <button ref={confirmSafeRef} type="button" className="mock-button mock-button--ghost" onClick={() => setConfirm(null)}>Keep working</button>
                  <button type="button" className="mock-button mock-button--primary" onClick={() => void finish("submit")}>Submit now</button>
                </div>
              </>
            ) : (
              <>
                <h2 id="mock-confirm-title">Leave and forfeit this test?</h2>
                <p className="mock-modal__warn"><CircleAlert size={18} />Leaving ends your only attempt. It is recorded as <strong>Forfeited</strong> and cannot be restarted.</p>
                <div className="mock-modal__actions">
                  <button ref={confirmSafeRef} type="button" className="mock-button mock-button--ghost" onClick={() => setConfirm(null)}>Stay in the test</button>
                  <button type="button" className="mock-button mock-button--danger" onClick={() => void finish("leave")}>Leave and forfeit</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {showWarning && warning && (
        <div className="mock-modal" role="presentation">
          <div ref={warningRef} className="mock-modal__card mock-modal__card--warning" role="alertdialog" aria-modal="true" aria-labelledby="mock-warning-title">
            <h2 id="mock-warning-title"><CircleAlert size={20} />{incidentLabel(warning)}</h2>
            <p>This has been recorded for your tutor with the time it happened. The clock kept running.</p>
            <p>Stay in the test window until you submit.</p>
            <div className="mock-modal__actions">
              {fullscreenSupported() ? (
                <button ref={warningActionRef} type="button" className="mock-button mock-button--primary" onClick={() => void returnToExam()}>
                  <Maximize size={16} />Return to full screen
                </button>
              ) : (
                <button ref={warningActionRef} type="button" className="mock-button mock-button--primary" onClick={dismissWarning}>Return to the test</button>
              )}
            </div>
          </div>
        </div>
      )}

      {finishing && (
        <div className="mock-modal" role="status" aria-live="polite">
          <div className="mock-modal__card"><h2>Submitting…</h2><p>Locking your answers on the server.</p></div>
        </div>
      )}
    </div>
  );

  // Portal to <body> so no ancestor transform can break the fixed exam layer.
  return createPortal(content, document.body);
}

/** Enters full screen from the Start button's click, before the runner mounts. */
export async function requestExamFullscreen(): Promise<void> {
  await enterFullscreen(document.documentElement);
}
