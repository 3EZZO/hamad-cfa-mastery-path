import { Archive, ArrowLeft, Check, CircleAlert, Clock3, Dumbbell, Flag, LockKeyhole, RotateCcw, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Crest } from "../../components/Crest";
import {
  getMockAnswerKey,
  getMockQuestions,
  getMockReview,
  gradeMockAttempt,
  type MockTestPackage,
  type MockWork,
} from "../../lib/cloudMockTests";
import { getCloudErrorMessage } from "../../lib/cloud";
import {
  MOCK_QUESTION_COUNT,
  formatMockClock,
  mockTimeUsedMs,
  optionLetter,
  type MockAttempt,
  type MockFinishReason,
  type MockOption,
  type MockQuestion,
  type MockReviewItem,
} from "../../lib/mockTestContent";

/** A tutor rehearsal is graded locally and never written anywhere. */
export interface LocalReview {
  reason: Exclude<MockFinishReason, "expired">;
  work: MockWork;
  correct: boolean[];
  score: number;
  timeUsedMs: number;
  pkg: MockTestPackage;
}

/**
 * Student review only: where a wrong answer leads. `practiceModuleId` is the
 * assigned practice set for this test's curriculum module (null when none
 * covers it yet, in which case Mistake Review and the repair queue are offered).
 */
export interface ReviewPractice {
  moduleTitle: string;
  practiceModuleId: string | null;
  onPractise: (practiceModuleId: string) => void;
  onOpenMistakes?: () => void;
  onOpenRepair?: () => void;
}

function reviewItemId(index: number): string {
  return `mock-review-q${index + 1}`;
}

/** Bring a question's explanation into view and move focus there for keyboard users. */
function showReviewItem(index: number): void {
  if (typeof document === "undefined") return;
  const target = document.getElementById(reviewItemId(index));
  if (!target) return;
  const reduced = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  target.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
  target.focus({ preventScroll: true });
}

interface ReviewData {
  questions: MockQuestion[];
  key: MockOption[];
  items: MockReviewItem[];
}

const FINISH_COPY: Record<MockFinishReason, string> = {
  submit: "Submitted",
  timeout: "Submitted automatically at 00:00",
  expired: "Time ran out while away; saved answers were submitted",
  leave: "Forfeited with Leave Test",
};

export function MockResults({
  moduleLabel,
  attempt: initialAttempt,
  local,
  onBack,
  practice,
}: {
  moduleLabel: string;
  attempt?: MockAttempt;
  local?: LocalReview;
  onBack: () => void;
  practice?: ReviewPractice;
}) {
  const [attempt, setAttempt] = useState(initialAttempt);
  const [review, setReview] = useState<ReviewData | null>(
    local ? { questions: local.pkg.questions.questions, key: local.pkg.key.correct, items: local.pkg.review.items } : null,
  );
  const [error, setError] = useState("");
  const [onlyMistakes, setOnlyMistakes] = useState(false);
  // A question chosen in the grid while the filter hides it: show everything, then scroll once rendered.
  const [pendingJump, setPendingJump] = useState<number | null>(null);
  useEffect(() => {
    if (pendingJump === null) return;
    showReviewItem(pendingJump);
    setPendingJump(null);
  }, [pendingJump, onlyMistakes]);

  useEffect(() => {
    if (!attempt || attempt.score !== null) return;
    gradeMockAttempt(attempt).then(setAttempt, cause => setError(getCloudErrorMessage(cause)));
  }, [attempt]);

  useEffect(() => {
    if (!attempt?.reviewReleased || review) return;
    Promise.all([getMockQuestions(attempt.moduleId), getMockAnswerKey(attempt.moduleId), getMockReview(attempt.moduleId)])
      .then(([questions, key, items]) => setReview({ questions: questions.questions, key, items: items.items }))
      .catch(cause => setError(getCloudErrorMessage(cause)));
  }, [attempt, review]);

  const score = local ? local.score : attempt?.score ?? null;
  const correct = local ? local.correct : attempt?.correct ?? null;
  const answers = local ? local.work.answers : attempt?.answers ?? [];
  const flags = local ? local.work.flags : attempt?.flags ?? [];
  const reason = local ? local.reason : attempt?.finishReason ?? null;
  const timeUsed = local ? local.timeUsedMs : attempt ? mockTimeUsedMs(attempt) : null;
  const forfeited = reason === "leave";
  const percent = score === null ? 0 : Math.round((score / MOCK_QUESTION_COUNT) * 100);
  // A strong result (6 of 8 or better) earns the crest medal in the reveal.
  const strong = !forfeited && score !== null && score >= Math.ceil(MOCK_QUESTION_COUNT * 0.75);
  // Until the tutor releases the review the student sees the final score only.
  const reviewOpen = Boolean(local) || attempt?.reviewReleased === true;
  // Unanswered counts as a mistake.
  const isMistake = (index: number) => review ? answers[index] !== review.key[index] : correct?.[index] === false;
  const mistakes = Array.from({ length: MOCK_QUESTION_COUNT }, (_, index) => index).filter(isMistake);
  const jumpTo = (index: number) => {
    if (onlyMistakes && !isMistake(index)) {
      setOnlyMistakes(false);
      setPendingJump(index);
    } else {
      showReviewItem(index);
    }
  };
  const practiseButton = (compact: boolean) => practice?.practiceModuleId ? (
    <button type="button" className={`mock-button ${compact ? "mock-button--ghost" : "mock-button--primary"}`} onClick={() => practice.onPractise(practice.practiceModuleId!)}>
      <Dumbbell size={16} />Practise {practice.moduleTitle}
    </button>
  ) : null;

  return (
    <section className="mock-results" aria-labelledby="mock-results-title">
      <button type="button" className="mock-results__back" onClick={onBack}><ArrowLeft size={18} />All module tests</button>
      <div className={`mock-results__reveal${forfeited ? " is-forfeit" : ""}${strong ? " is-strong" : ""}`}>
        {strong && <Crest size={56} animated className="mock-results__medal" />}
        <p className="mock-results__eyebrow">{local ? "Rehearsal result · not saved" : moduleLabel}</p>
        <h2 id="mock-results-title">{forfeited ? "Test forfeited" : "Your result"}</h2>
        <div className="mock-score" style={{ ["--mock-score" as string]: `${percent}` }} aria-label={score === null ? "Grading" : `${score} out of ${MOCK_QUESTION_COUNT}`}>
          <span className="mock-score__value">{score === null ? "…" : score}</span>
          <span className="mock-score__of">/ {MOCK_QUESTION_COUNT}</span>
        </div>
        <dl className="mock-results__facts">
          <div><dt>Score</dt><dd>{score === null ? "Grading…" : `${percent}%`}</dd></div>
          {reviewOpen && (
            <>
              <div><dt><Clock3 size={14} />Time used</dt><dd>{timeUsed === null ? "—" : formatMockClock(timeUsed)}</dd></div>
              <div><dt>Finish</dt><dd>{reason ? FINISH_COPY[reason] : "—"}</dd></div>
            </>
          )}
        </dl>
      </div>
      {error && <p className="mock-hub__error" role="alert"><CircleAlert size={16} />{error}</p>}

      {reviewOpen && (
        <ol className="mock-results__grid" aria-label="Question results">
          {Array.from({ length: MOCK_QUESTION_COUNT }, (_, index) => {
            const right = correct?.[index];
            return (
              <li key={index} className={right === undefined ? "" : right ? "is-right" : "is-wrong"}>
                <button type="button" className="mock-results__jump" disabled={!review} onClick={() => jumpTo(index)}>
                  <span>Q{index + 1}</span>
                  {right === undefined ? null : right ? <Check size={16} aria-label="correct" /> : <X size={16} aria-label="wrong" />}
                  <small>{answers[index] === null ? "No answer" : `You chose ${optionLetter(answers[index])}`}</small>
                  {flags[index] && <Flag size={12} aria-label="flagged" />}
                </button>
              </li>
            );
          })}
        </ol>
      )}

      {reviewOpen && practice && review && mistakes.length > 0 && (
        <div className="mock-practice" role="group" aria-label="Repair this module">
          {practice.practiceModuleId ? (
            <>
              <p><strong>{mistakes.length} to repair.</strong> Practise {practice.moduleTitle} with a focused set from your practice questions.</p>
              {practiseButton(false)}
            </>
          ) : (
            <>
              <p>No practice set for {practice.moduleTitle} yet. Repair the misses in Mistake Review or the repair queue.</p>
              {practice.onOpenMistakes && <button type="button" className="mock-button mock-button--ghost" onClick={practice.onOpenMistakes}><Archive size={16} />Mistake Review</button>}
              {practice.onOpenRepair && <button type="button" className="mock-button mock-button--ghost" onClick={practice.onOpenRepair}><RotateCcw size={16} />Repair queue</button>}
            </>
          )}
        </div>
      )}

      {reviewOpen && review ? (
        <div className="mock-review">
          <div className="mock-review__head">
            <h3>Answers and explanations</h3>
            <div className="mock-review__filter" role="group" aria-label="Show">
              <button type="button" className="mock-switch__option" aria-pressed={!onlyMistakes} onClick={() => setOnlyMistakes(false)}>
                All questions
              </button>
              <button type="button" className="mock-switch__option" aria-pressed={onlyMistakes} disabled={mistakes.length === 0} onClick={() => setOnlyMistakes(true)}>
                Only my mistakes <span className="mock-switch__count">{mistakes.length}</span>
              </button>
            </div>
          </div>
          {onlyMistakes && mistakes.length === 0 && <p className="mock-results__pending">No mistakes in this test.</p>}
          {review.questions.map((question, index) => {
            const item = review.items[index];
            const right = review.key[index];
            const chosen = answers[index];
            if (onlyMistakes && chosen === right) return null;
            return (
              <article key={question.id} id={reviewItemId(index)} tabIndex={-1} className="mock-review__item">
                <header>
                  <span className={chosen === right ? "is-right" : "is-wrong"}>Q{index + 1}</span>
                  {item && <small>{item.concept}</small>}
                </header>
                <p className="mock-review__stem">{question.stem}</p>
                <ul className="mock-review__options">
                  {question.options.map((text, option) => (
                    <li key={option} className={[option === right && "is-key", option === chosen && option !== right && "is-chosen-wrong"].filter(Boolean).join(" ")}>
                      <strong>{optionLetter(option)}.</strong> {text}
                      {option === right && <em>Correct</em>}
                      {option === chosen && option !== right && <em>Your answer</em>}
                    </li>
                  ))}
                </ul>
                {item && (
                  <>
                    <p>{item.explanation}</p>
                    {item.working.length > 0 && <ol className="mock-review__working">{item.working.map((step, stepIndex) => <li key={stepIndex}>{step}</li>)}</ol>}
                    {item.keystrokes && <p className="mock-review__keys"><strong>BA II Plus:</strong> <code>{item.keystrokes}</code></p>}
                    <ul className="mock-review__why">
                      {item.distractors.map((why, option) => <li key={option}><strong>{optionLetter(option)}:</strong> {why}</li>)}
                    </ul>
                  </>
                )}
                {chosen !== right && practice?.practiceModuleId && <div className="mock-review__practice">{practiseButton(true)}</div>}
              </article>
            );
          })}
        </div>
      ) : (
        <p className="mock-results__pending"><LockKeyhole size={16} />Your question-by-question results, correct answers and explanations appear here when your tutor releases the review.</p>
      )}
    </section>
  );
}
