import { ArrowLeft, Check, CircleAlert, Clock3, Flag, LockKeyhole, X } from "lucide-react";
import { useEffect, useState } from "react";
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
}: {
  moduleLabel: string;
  attempt?: MockAttempt;
  local?: LocalReview;
  onBack: () => void;
}) {
  const [attempt, setAttempt] = useState(initialAttempt);
  const [review, setReview] = useState<ReviewData | null>(
    local ? { questions: local.pkg.questions.questions, key: local.pkg.key.correct, items: local.pkg.review.items } : null,
  );
  const [error, setError] = useState("");

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

  return (
    <section className="mock-results" aria-labelledby="mock-results-title">
      <button type="button" className="mock-results__back" onClick={onBack}><ArrowLeft size={18} />All module tests</button>
      <div className={`mock-results__reveal${forfeited ? " is-forfeit" : ""}`}>
        <p className="mock-results__eyebrow">{local ? "Rehearsal result · not saved" : moduleLabel}</p>
        <h2 id="mock-results-title">{forfeited ? "Test forfeited" : "Your result"}</h2>
        <div className="mock-score" style={{ ["--mock-score" as string]: `${percent}` }} aria-label={score === null ? "Grading" : `${score} out of ${MOCK_QUESTION_COUNT}`}>
          <span className="mock-score__value">{score === null ? "…" : score}</span>
          <span className="mock-score__of">/ {MOCK_QUESTION_COUNT}</span>
        </div>
        <dl className="mock-results__facts">
          <div><dt>Score</dt><dd>{score === null ? "Grading…" : `${percent}%`}</dd></div>
          <div><dt><Clock3 size={14} />Time used</dt><dd>{timeUsed === null ? "—" : formatMockClock(timeUsed)}</dd></div>
          <div><dt>Finish</dt><dd>{reason ? FINISH_COPY[reason] : "—"}</dd></div>
        </dl>
      </div>
      {error && <p className="mock-hub__error" role="alert"><CircleAlert size={16} />{error}</p>}

      <ol className="mock-results__grid" aria-label="Question results">
        {Array.from({ length: MOCK_QUESTION_COUNT }, (_, index) => {
          const right = correct?.[index];
          return (
            <li key={index} className={right === undefined ? "" : right ? "is-right" : "is-wrong"}>
              <span>Q{index + 1}</span>
              {right === undefined ? null : right ? <Check size={16} aria-label="correct" /> : <X size={16} aria-label="wrong" />}
              <small>{answers[index] === null ? "No answer" : `You chose ${optionLetter(answers[index])}`}</small>
              {flags[index] && <Flag size={12} aria-label="flagged" />}
            </li>
          );
        })}
      </ol>

      {review ? (
        <div className="mock-review">
          <h3>Answers and explanations</h3>
          {review.questions.map((question, index) => {
            const item = review.items[index];
            const right = review.key[index];
            const chosen = answers[index];
            return (
              <article key={question.id} className="mock-review__item">
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
              </article>
            );
          })}
        </div>
      ) : (
        <p className="mock-results__pending"><LockKeyhole size={16} />Correct answers and explanations appear here when your tutor releases the review.</p>
      )}
    </section>
  );
}
