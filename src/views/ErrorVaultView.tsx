// Moved out of App.tsx unchanged (P3.9 split); see git history for origin.
import { Archive, Check, CircleAlert, CircleCheckBig, Plus, ShieldCheck, TimerReset, Trash2 } from "lucide-react";
import { type FormEvent, useState } from "react";
import { TOPICS } from "../data/plan";
import { formatDate, todayDateOnly } from "../lib/dates";
import { useAppDialog } from "../components/AppDialog";
import type { ErrorEntry, TrackerState } from "../types";
import { ERROR_CATEGORIES, EmptyState, MiniMetric, cx, makeId, topicShort } from "./shared";
import type { Notify, UpdateTracker } from "./shared";

export function ErrorVaultView({
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
    category: ERROR_CATEGORIES[0],
    summary: "",
    correction: "",
    revisitDate: "",
  });
  const openCount = tracker.errorEntries.filter((entry) => !entry.resolved).length;
  const dueCount = tracker.errorEntries.filter((entry) => !entry.resolved && entry.revisitDate && entry.revisitDate <= todayDateOnly()).length;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const entry: ErrorEntry = { id: makeId("error"), ...form, resolved: false };
    updateTracker((current) => ({ ...current, errorEntries: [entry, ...current.errorEntries] }));
    setForm((current) => ({ ...current, summary: "", correction: "", revisitDate: "" }));
    notify("Error pattern secured in the vault.");
  };

  const toggleResolved = (id: string) => {
    updateTracker((current) => ({ ...current, errorEntries: current.errorEntries.map((entry) => entry.id === id ? { ...entry, resolved: !entry.resolved } : entry) }));
  };

  const remove = async (id: string) => {
    if (!await dialog.confirm("Delete this error-vault entry?")) return;
    updateTracker((current) => ({ ...current, errorEntries: current.errorEntries.filter((entry) => entry.id !== id) }));
  };

  const sorted = [...tracker.errorEntries].sort((a, b) => Number(a.resolved) - Number(b.resolved) || b.date.localeCompare(a.date));

  return (
    <div className="view-stack">
      <div className="disclaimer-card"><Archive size={19} /><p><strong>Store the lesson, not the item.</strong> Use an original one-line pattern summary. Do not paste proprietary or copyrighted question content.</p></div>
      <section className="mini-metric-grid">
        <MiniMetric label="Open patterns" value={String(openCount)} icon={CircleAlert} />
        <MiniMetric label="Due for retest" value={String(dueCount)} icon={TimerReset} />
        <MiniMetric label="Resolved" value={String(tracker.errorEntries.length - openCount)} icon={CircleCheckBig} />
      </section>
      <section className="form-and-list">
        <form className="panel entry-form" onSubmit={submit}>
          <div className="panel-heading"><div><p className="eyebrow">New pattern</p><h3>Secure the lesson</h3></div><Plus size={20} /></div>
          <div className="form-grid form-grid-2">
            <label><span>Date</span><input required type="date" value={form.date} onChange={(event) => setForm({ ...form, date: event.target.value })} /></label>
            <label><span>Topic</span><select value={form.topic} onChange={(event) => setForm({ ...form, topic: event.target.value })}>{TOPICS.map((topic) => <option key={topic}>{topic}</option>)}</select></label>
            <label><span>Error category</span><select value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })}>{ERROR_CATEGORIES.map((category) => <option key={category}>{category}</option>)}</select></label>
            <label><span>Retest date <em>optional</em></span><input type="date" value={form.revisitDate} onChange={(event) => setForm({ ...form, revisitDate: event.target.value })} /></label>
          </div>
          <label><span>Pattern summary</span><textarea required rows={3} maxLength={300} placeholder="Original summary only: what reasoning pattern failed?" value={form.summary} onChange={(event) => setForm({ ...form, summary: event.target.value })} /></label>
          <label><span>Correction rule</span><textarea required rows={3} maxLength={400} placeholder="When I see ___, I will ___ because ___." value={form.correction} onChange={(event) => setForm({ ...form, correction: event.target.value })} /></label>
          <button className="button button-primary" type="submit"><Plus size={16} /> Add to vault</button>
        </form>

        <section className="panel log-panel">
          <div className="panel-heading"><div><p className="eyebrow">Review queue</p><h3>Error patterns</h3></div><Archive size={20} /></div>
          {sorted.length ? (
            <div className="entry-list">
              {sorted.map((entry) => (
                <article className={cx("error-entry", entry.resolved && "is-resolved")} key={entry.id}>
                  <div className="error-entry-top"><div><span>{topicShort(entry.topic)} · {entry.category}{entry.questionId && <em className="error-entry-origin">From practice</em>}</span><strong>{entry.summary}</strong></div><div className="entry-actions"><button className="icon-button" type="button" onClick={() => toggleResolved(entry.id)} aria-label={entry.resolved ? "Reopen error" : "Resolve error"}>{entry.resolved ? <Archive size={15} /> : <Check size={15} />}</button><button className="icon-button icon-button-danger" type="button" onClick={() => remove(entry.id)} aria-label="Delete error"><Trash2 size={15} /></button></div></div>
                  <div className="correction-rule"><ShieldCheck size={16} /><p><strong>Correction rule</strong>{entry.correction}</p></div>
                  <footer>{formatDate(entry.date)}{entry.revisitDate && ` · Retest ${formatDate(entry.revisitDate)}`} · {entry.resolved ? "Resolved" : "Open"}</footer>
                </article>
              ))}
            </div>
          ) : <EmptyState icon={Archive} title="The vault is empty">The first reviewed miss should become an original pattern and correction rule.</EmptyState>}
        </section>
      </section>
    </div>
  );
}
