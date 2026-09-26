import { ArrowLeft, BadgeCheck, CircleAlert, Save } from "lucide-react";
import { useState } from "react";
import { saveMockAnswerKey, setMockTestPublished, type MockTestPackage } from "../../lib/cloudMockTests";
import { getCloudErrorMessage } from "../../lib/cloud";
import { optionLetter, type MockOption, type MockReviewItem, type MockTestMeta } from "../../lib/mockTestContent";
import "./moduleMock.css";

/**
 * Tutor-only answer key review. The tutor checks every question, answer,
 * explanation and confidence level, can correct the answer or explanation,
 * and only then publishes the test to the student.
 */
export function MockAnswerKeyReview({
  pkg,
  onBack,
  onPublished,
  notify,
}: {
  pkg: MockTestPackage;
  onBack: () => void;
  onPublished: (meta: MockTestMeta) => void;
  notify: (message: string, tone?: "success" | "warning") => void;
}) {
  const published = pkg.meta.status === "published";
  const [correct, setCorrect] = useState<MockOption[]>(pkg.key.correct);
  const [items, setItems] = useState<MockReviewItem[]>(pkg.review.items);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirmPublish, setConfirmPublish] = useState(false);
  const dirty = JSON.stringify(correct) !== JSON.stringify(pkg.key.correct)
    || JSON.stringify(items) !== JSON.stringify(pkg.review.items);
  const needsAttention = items.filter(item => item.confidence !== "High").length;

  const save = async () => {
    setBusy(true);
    setError("");
    try {
      await saveMockAnswerKey(pkg.meta.moduleId, { ...pkg.key, correct }, { ...pkg.review, items });
      pkg.key.correct = correct;
      pkg.review.items = items;
      notify("Answer key saved.");
    } catch (cause) {
      setError(getCloudErrorMessage(cause));
    } finally {
      setBusy(false);
    }
  };

  const publish = async () => {
    setBusy(true);
    setError("");
    try {
      if (dirty) await saveMockAnswerKey(pkg.meta.moduleId, { ...pkg.key, correct }, { ...pkg.review, items });
      const meta = await setMockTestPublished(pkg.meta, true);
      notify(`${meta.title} is published. It is now visible to the student.`);
      onPublished(meta);
    } catch (cause) {
      setError(getCloudErrorMessage(cause));
    } finally {
      setBusy(false);
      setConfirmPublish(false);
    }
  };

  const edit = (index: number, change: Partial<MockReviewItem>) =>
    setItems(current => current.map((item, position) => (position === index ? { ...item, ...change } : item)));

  return (
    <section className="panel mock-keyreview" aria-labelledby="mock-keyreview-title">
      <button type="button" className="mock-results__back" onClick={onBack}><ArrowLeft size={18} />Back to module tests</button>
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Answer key review · {published ? "Published (read-only)" : "Draft, hidden from the student"}</p>
          <h3 id="mock-keyreview-title">{pkg.meta.title}</h3>
          <small>Version {pkg.meta.version}</small>
        </div>
      </div>
      {needsAttention > 0 && (
        <p className="mock-hub__error"><CircleAlert size={16} />{needsAttention} {needsAttention === 1 ? "answer is" : "answers are"} below High confidence. Check them before publishing.</p>
      )}
      {published && <p className="mock-hub__note">This test is published, so its key is locked. Unpublish it from the module list to make changes.</p>}

      {pkg.questions.questions.map((question, index) => {
        const item = items[index]!;
        return (
          <article key={question.id} className={`mock-keyreview__item mock-keyreview__item--${item.confidence.toLowerCase()}`}>
            <header>
              <strong>Q{index + 1}</strong>
              <span>{item.concept}</span>
              <span className={`mock-confidence mock-confidence--${item.confidence.toLowerCase()}`}>{item.confidence} confidence</span>
              {item.sourceRef && <small>{item.sourceRef}{item.sourceFiles.length ? ` · ${item.sourceFiles.join(", ")}` : ""}</small>}
            </header>
            <p className="mock-review__stem">{question.stem}</p>
            {question.table && (
              <div className="mock-table-wrap">
                <table className="mock-table">
                  {question.table.caption && <caption>{question.table.caption}</caption>}
                  <thead><tr>{question.table.headers.map((header, column) => <th key={column} scope="col">{header}</th>)}</tr></thead>
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
            <fieldset className="mock-keyreview__options" disabled={published || busy}>
              <legend>Correct answer</legend>
              {question.options.map((text, option) => (
                <label key={option} className={correct[index] === option ? "is-key" : ""}>
                  <input
                    type="radio"
                    name={`key-${question.id}`}
                    checked={correct[index] === option}
                    onChange={() => setCorrect(current => current.map((value, position) => (position === index ? (option as MockOption) : value)))}
                  />
                  <strong>{optionLetter(option)}.</strong> {text}
                </label>
              ))}
            </fieldset>
            <label className="mock-keyreview__field">
              <span>Explanation</span>
              <textarea
                value={item.explanation}
                disabled={published || busy}
                rows={4}
                onChange={event => edit(index, { explanation: event.target.value })}
              />
            </label>
            {item.working.length > 0 && <ol className="mock-review__working">{item.working.map((step, stepIndex) => <li key={stepIndex}>{step}</li>)}</ol>}
            {item.keystrokes && <p className="mock-review__keys"><strong>BA II Plus:</strong> <code>{item.keystrokes}</code></p>}
            <ul className="mock-review__why">
              {item.distractors.map((why, option) => <li key={option}><strong>{optionLetter(option)}:</strong> {why}</li>)}
            </ul>
          </article>
        );
      })}

      {error && <p className="form-error" role="alert"><CircleAlert size={16} />{error}</p>}
      {!published && (
        <div className="mock-keyreview__actions">
          <button type="button" className="button" disabled={!dirty || busy} onClick={() => void save()}><Save size={16} />Save changes</button>
          {confirmPublish ? (
            <>
              <span>Publish now? The student will see this test and can start it.</span>
              <button type="button" className="button" disabled={busy} onClick={() => setConfirmPublish(false)}>Cancel</button>
              <button type="button" className="button button-primary" disabled={busy} onClick={() => void publish()}><BadgeCheck size={16} />Confirm publish</button>
            </>
          ) : (
            <button type="button" className="button button-primary" disabled={busy} onClick={() => setConfirmPublish(true)}><BadgeCheck size={16} />Approve &amp; Publish</button>
          )}
        </div>
      )}
    </section>
  );
}
