// Moved out of App.tsx unchanged (P3.9 split); see git history for origin.
import { BarChart3, BookOpenCheck, CircleAlert, CircleCheckBig, Plus, Target, Trash2 } from "lucide-react";
import { type FormEvent, useState } from "react";
import { TOPICS } from "../data/plan";
import { formatDate, todayDateOnly } from "../lib/dates";
import { useAppDialog } from "../components/AppDialog";
import type { PracticeLog, TrackerState } from "../types";
import { EmptyState, MiniMetric, ProgressBar, makeId, sortByDateDesc, topicShort } from "./shared";
import type { Notify, UpdateTracker } from "./shared";

export function PracticeLogView({
  tracker,
  updateTracker,
  notify,
}: {
  tracker: TrackerState;
  updateTracker: UpdateTracker;
  notify: Notify;
}) {
  const dialog = useAppDialog();
  const [form, setForm] = useState({
    date: todayDateOnly(),
    topic: TOPICS[0] as string,
    attempted: 30,
    correct: 0,
    confidence: 3,
    source: "",
    note: "",
  });
  const [formError, setFormError] = useState("");
  const attempted = tracker.practiceLogs.reduce((sum, log) => sum + log.attempted, 0);
  const correct = tracker.practiceLogs.reduce((sum, log) => sum + log.correct, 0);
  const accuracy = attempted ? Math.round((correct / attempted) * 100) : 0;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (form.correct > form.attempted) {
      setFormError("Correct responses cannot exceed attempted responses.");
      return;
    }
    setFormError("");
    const entry: PracticeLog = { id: makeId("practice"), ...form };
    updateTracker((current) => ({ ...current, practiceLogs: [entry, ...current.practiceLogs] }));
    setForm((current) => ({ ...current, attempted: 30, correct: 0, source: "", note: "" }));
    notify("Practice block logged.");
  };

  const remove = async (id: string) => {
    if (!await dialog.confirm("Delete this practice block?")) return;
    updateTracker((current) => ({ ...current, practiceLogs: current.practiceLogs.filter((entry) => entry.id !== id) }));
  };

  return (
    <div className="view-stack">
      <section className="mini-metric-grid">
        <MiniMetric label="Questions attempted" value={attempted.toLocaleString()} icon={BookOpenCheck} />
        <MiniMetric label="Correct" value={correct.toLocaleString()} icon={CircleCheckBig} />
        <MiniMetric label="Cumulative accuracy" value={attempted ? `${accuracy}%` : "—"} icon={Target} />
      </section>
      <section className="form-and-list">
        <form className="panel entry-form" onSubmit={submit}>
          <div className="panel-heading"><div><p className="eyebrow">New evidence</p><h3>Log a practice block</h3></div><Plus size={20} /></div>
          <div className="form-grid form-grid-2">
            <label><span>Date</span><input type="date" required value={form.date} onChange={(event) => setForm({ ...form, date: event.target.value })} /></label>
            <label><span>Topic</span><select value={form.topic} onChange={(event) => setForm({ ...form, topic: event.target.value })}>{TOPICS.map((topic) => <option key={topic}>{topic}</option>)}</select></label>
            <label><span>Attempted</span><input type="number" min="1" max="500" required value={form.attempted} onChange={(event) => setForm({ ...form, attempted: Number(event.target.value) })} /></label>
            <label><span>Correct</span><input type="number" min="0" max={form.attempted} required value={form.correct} onChange={(event) => setForm({ ...form, correct: Number(event.target.value) })} /></label>
            <label><span>Confidence (1-5)</span><input type="number" min="1" max="5" required value={form.confidence} onChange={(event) => setForm({ ...form, confidence: Number(event.target.value) })} /></label>
          </div>
          <label><span>Source label <em>optional</em></span><input maxLength={80} placeholder="e.g. Topic review set A" value={form.source} onChange={(event) => setForm({ ...form, source: event.target.value })} /></label>
          <label><span>Lesson from the block</span><textarea rows={3} maxLength={500} placeholder="Pattern noticed, decision to change, or area to revisit." value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} /></label>
          {formError && <p className="form-error"><CircleAlert size={15} />{formError}</p>}
          <button className="button button-primary" type="submit"><Plus size={16} /> Save practice</button>
        </form>

        <section className="panel log-panel">
          <div className="panel-heading"><div><p className="eyebrow">History</p><h3>Practice record</h3></div><BarChart3 size={20} /></div>
          {tracker.practiceLogs.length ? (
            <div className="entry-list">
              {sortByDateDesc(tracker.practiceLogs).map((entry) => {
                const score = Math.round((entry.correct / entry.attempted) * 100);
                return (
                  <article className="practice-entry" key={entry.id}>
                    <div className="practice-score"><strong>{score}%</strong><span>{entry.correct}/{entry.attempted}</span></div>
                    <div className="practice-copy"><span>{topicShort(entry.topic)} · {formatDate(entry.date)} · confidence {entry.confidence ?? 3}/5</span><strong>{entry.source || "Practice block"}</strong>{entry.note && <p>{entry.note}</p>}<ProgressBar value={score} tone={score >= 70 ? "green" : "gold"} /></div>
                    <button className="icon-button icon-button-danger" type="button" onClick={() => remove(entry.id)} aria-label="Delete practice block"><Trash2 size={15} /></button>
                  </article>
                );
              })}
            </div>
          ) : <EmptyState icon={BookOpenCheck} title="No practice evidence yet">Log the first block to establish volume and accuracy.</EmptyState>}
        </section>
      </section>
    </div>
  );
}
