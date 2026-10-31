import { ArrowLeft, BadgeCheck, CircleAlert, Save } from "lucide-react";
import { useState } from "react";
import { saveMockAnswerKey, setMockTestPublished, type MockTestPackage } from "../../lib/cloudMockTests";
import { getCloudErrorMessage } from "../../lib/cloud";
import { mockModuleById, mockModuleCode } from "../../data/mockModules";
import { READING_INDEX } from "../../data/readings";
import { formatMockClock, mockDocBytes, optionLetter, type MockOption, type MockReviewItem, type MockSourcesDoc, type MockTestMeta } from "../../lib/mockTestContent";
import "./moduleMock.css";
import { MockExhibits, MockReviewExhibits } from "./MockExhibits";

function countBy(values: readonly string[]): [string, number][] {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0]));
}

/**
 * A paper's upload report: size and timing, coverage by module test, official
 * 2027 module and skill, graphics, authored questions and document sizes, so
 * the tutor sees what the paper assesses before publishing it.
 */
export function PaperUploadReport({ pkg, sources }: { pkg: MockTestPackage; sources: MockSourcesDoc }) {
  const items = sources.items;
  const authored = items.filter(item => item.authoring === "authored").length;
  const graphics = pkg.questions.questions.filter(question => question.figure || question.tree).length;
  const reviewGraphics = pkg.review.items.filter(item => item.reviewFigure || item.reviewTree).length;
  const tables = pkg.questions.questions.filter(question => question.table).length;
  const keystrokes = pkg.review.items.filter(item => item.keystrokes).length;
  const sizes = [["questions", pkg.questions], ["key", pkg.key], ["review", pkg.review], ["sources", sources]] as const;
  return (
    <section className="mock-report" aria-label="Paper upload report">
      <p>
        <strong>{pkg.meta.questionCount} questions · {formatMockClock(pkg.meta.durationSeconds * 1000)}</strong>
        {" "}· {tables} tables · {graphics} exam graphics · {reviewGraphics} review-only graphics · {keystrokes} with BA II Plus keystrokes
        {" "}· {authored} authored (not from the bank)
      </p>
      <div className="mock-report__grid">
        <div>
          <h4>Module tests</h4>
          <ul>{countBy(items.map(item => item.moduleTag)).map(([id, count]) => {
            const module = mockModuleById(id);
            return <li key={id}>{module ? `${mockModuleCode(module)} ${module.title}` : id}: {count}</li>;
          })}</ul>
        </div>
        <div>
          <h4>Official 2027 modules</h4>
          <ul>{countBy(items.map(item => item.catalogId)).map(([id, count]) => <li key={id}>{READING_INDEX.get(id)?.title ?? id}: {count}</li>)}</ul>
        </div>
        <div>
          <h4>Skills and learning outcomes</h4>
          <ul>{countBy(items.map(item => item.skill)).map(([id, count]) => <li key={id}>{id}: {count}</li>)}</ul>
          <p>{new Set(items.flatMap(item => item.los)).size} distinct learning outcomes</p>
        </div>
      </div>
      <p className="mock-report__sizes">
        Document sizes: {sizes.map(([name, doc]) => `${name} ${Math.round(mockDocBytes(doc) / 1024)} KB`).join(" · ")}
      </p>
    </section>
  );
}

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
      <button type="button" className="mock-results__back" onClick={onBack}><ArrowLeft size={18} />Back to tests</button>
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
      {pkg.sources && <PaperUploadReport pkg={pkg} sources={pkg.sources} />}

      {pkg.questions.questions.map((question, index) => {
        const item = items[index]!;
        const source = pkg.sources?.items[index];
        return (
          <article key={question.id} className={`mock-keyreview__item mock-keyreview__item--${item.confidence.toLowerCase()}`}>
            <header>
              <strong>Q{index + 1}</strong>
              <span>{item.concept}</span>
              <span className={`mock-confidence mock-confidence--${item.confidence.toLowerCase()}`}>{item.confidence} confidence</span>
              {item.sourceRef && <small>{item.sourceRef}{item.sourceFiles.length ? ` · ${item.sourceFiles.join(", ")}` : ""}</small>}
              {source && (
                <small className="mock-keyreview__tags">
                  {mockModuleById(source.moduleTag) ? mockModuleCode(mockModuleById(source.moduleTag)!) : source.moduleTag}
                  {" "}· {READING_INDEX.get(source.catalogId)?.title ?? source.catalogId} · {source.skill}
                  {source.exhibitPolicy !== "none" ? ` · graphic ${source.exhibitPolicy}` : ""}
                  {" "}· {source.authoring === "authored" ? "Authored" : `Source p. ${source.sourcePage}`}
                  {source.los.length ? ` · LOS: ${source.los.join("; ")}` : ""}
                </small>
              )}
            </header>
            <p className="mock-review__stem">{question.stem}</p>
            <MockExhibits question={question} />
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
            <MockReviewExhibits item={item} />
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
              <span>Publish {pkg.meta.title} version {pkg.meta.version} now? The student will see it and can start it.</span>
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
