// Moved out of App.tsx unchanged (P3.9 split); see git history for origin.
import { FileText, Flag, Plus, ShieldCheck, Trash2, TrendingUp } from "lucide-react";
import { type FormEvent, type ReactNode, Suspense, useState } from "react";
import { PLAN, TOPICS } from "../data/plan";
import program from "../data/program.json";
import { formatDate, todayDateOnly } from "../lib/dates";
import { formatMockSection, summarizeMockSections } from "../lib/mockSections";
import { useAppDialog } from "../components/AppDialog";
import { MockScoreChart } from "../lazyViews";
import type { MockScore, TrackerState } from "../types";
import { EmptyState, clamp, cx, makeId, sortByDateDesc, topicShort } from "./shared";
import type { Notify, UpdateTracker } from "./shared";

export function MockView({
  tracker,
  updateTracker,
  notify,
  canManage,
  moduleMockScores,
}: {
  tracker: TrackerState;
  updateTracker: UpdateTracker;
  notify: Notify;
  canManage: boolean;
  /** Module mock test scores, shown above the full-mock trend. */
  moduleMockScores?: ReactNode;
}) {
  const dialog = useAppDialog();
  const [form, setForm] = useState({
    date: todayDateOnly(),
    milestoneWeek: null as number | null,
    label: "",
    score: 0,
    note: "",
  });
  // Section tallies are typed as text so a field can be left blank; only
  // topics with attempted questions are saved.
  const emptySections = () => Object.fromEntries(TOPICS.map((topic) => [topic, { attempted: "", correct: "" }])) as Record<string, { attempted: string; correct: string }>;
  const [sectionForm, setSectionForm] = useState(emptySections);
  const [sectionsOpen, setSectionsOpen] = useState(false);
  const sectionEntries = () =>
    TOPICS.flatMap((topic) => {
      const attempted = Math.round(Number(sectionForm[topic]?.attempted));
      const correct = Math.round(Number(sectionForm[topic]?.correct));
      if (!Number.isFinite(attempted) || attempted <= 0) return [];
      return [{ topic, attempted, correct: Number.isFinite(correct) ? Math.min(Math.max(correct, 0), attempted) : 0 }];
    });
  const fullMockTargets = PLAN.flatMap((week) =>
    week.mockMilestone &&
    week.mockMilestone.targetScore !== null &&
    /^Mock [1-7]$/.test(week.mockMilestone.label)
      ? [{ week: week.week, ...week.mockMilestone }]
      : [],
  );
  const chronological = [...tracker.mockScores].sort((a, b) => a.date.localeCompare(b.date));
  const chartData = chronological.map((entry, index) => ({
    name: entry.label,
    score: entry.score,
    target: PLAN.find((week) => week.week === entry.milestoneWeek)?.mockMilestone?.targetScore ?? fullMockTargets[index]?.targetScore ?? 72,
    sections: summarizeMockSections(entry).map((section) => formatMockSection(section, topicShort)),
  }));

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!canManage) return;
    const sections = sectionEntries();
    const entry: MockScore = { id: makeId("mock"), ...form, score: clamp(form.score), ...(sections.length ? { sections } : {}) };
    updateTracker((current) => ({ ...current, mockScores: [...current.mockScores, entry] }));
    setForm({ date: todayDateOnly(), milestoneWeek: null, label: "", score: 0, note: "" });
    setSectionForm(emptySections());
    setSectionsOpen(false);
    notify("Mock score logged.");
  };

  const remove = async (id: string) => {
    if (!await dialog.confirm("Delete this mock score?")) return;
    updateTracker((current) => ({ ...current, mockScores: current.mockScores.filter((entry) => entry.id !== id) }));
  };

  return (
    <div className="view-stack">
      {moduleMockScores}
      <div className="disclaimer-card"><ShieldCheck size={19} /><p><strong>Internal evidence, not an official pass mark.</strong> {program.readinessDisclaimer}</p></div>
      <section className="mock-grid">
        <article className="panel chart-panel">
          <div className="panel-heading"><div><p className="eyebrow">Trend</p><h3>Mock score trajectory</h3></div><TrendingUp size={21} /></div>
          {chartData.length ? (
            <div className="chart-wrap">
              <Suspense fallback={<div className="chart-loading">Loading score chart…</div>}>
                <MockScoreChart data={chartData} />
              </Suspense>
            </div>
          ) : <EmptyState icon={TrendingUp} title="The curve starts with Mock 1">Scores will appear here with the internal target trajectory.</EmptyState>}
          <p className="chart-note">{program.mockGuidance}</p>
        </article>

        {canManage ? <form className="panel entry-form mock-form" onSubmit={submit}>
          <div className="panel-heading"><div><p className="eyebrow">New result</p><h3>Log a mock</h3></div><Plus size={20} /></div>
          <label><span>Date</span><input required type="date" value={form.date} onChange={(event) => setForm({ ...form, date: event.target.value })} /></label>
          <label><span>Mock milestone</span><select required value={form.milestoneWeek ?? ""} onChange={(event) => { const milestoneWeek = Number(event.target.value); const milestone = fullMockTargets.find((item) => item.week === milestoneWeek); setForm({ ...form, milestoneWeek, label: milestone?.label ?? "" }); }}><option value="" disabled>Select Mock 1-7</option>{fullMockTargets.map((item) => <option key={item.week} value={item.week}>Week {item.week} · {item.label} · target {item.targetScore}%</option>)}</select></label>
          <label><span>Score %</span><input required type="number" min="0" max="100" value={form.score} onChange={(event) => setForm({ ...form, score: Number(event.target.value) })} /></label>
          <label><span>Evidence note</span><textarea rows={3} maxLength={500} placeholder="What drove this result?" value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} /></label>
          <details className="mock-sections" open={sectionsOpen} onToggle={(event) => setSectionsOpen((event.target as HTMLDetailsElement).open)}>
            <summary><span>Section breakdown</span><small>{sectionEntries().length ? `${sectionEntries().length} of ${TOPICS.length} topics` : "Optional · correct / attempted per topic"}</small></summary>
            <div className="mock-sections__grid">
              {TOPICS.map((topic) => (
                <div className="mock-sections__row" key={topic}>
                  <span>{topicShort(topic)}</span>
                  <input type="number" inputMode="numeric" min="0" max="500" placeholder="correct" aria-label={`${topic} correct`} value={sectionForm[topic]?.correct ?? ""} onChange={(event) => setSectionForm({ ...sectionForm, [topic]: { ...sectionForm[topic], correct: event.target.value } })} />
                  <span aria-hidden="true">/</span>
                  <input type="number" inputMode="numeric" min="0" max="500" placeholder="attempted" aria-label={`${topic} attempted`} value={sectionForm[topic]?.attempted ?? ""} onChange={(event) => setSectionForm({ ...sectionForm, [topic]: { ...sectionForm[topic], attempted: event.target.value } })} />
                </div>
              ))}
            </div>
          </details>
          <button className="button button-primary" type="submit"><Plus size={16} /> Save result</button>
        </form> : <article className="panel read-only-panel"><ShieldCheck size={22} /><div><p className="eyebrow">Student view</p><h3>Mock administration is tutor-managed</h3><p>Results and the campaign ladder remain visible here as soon as Mohamed records them.</p></div></article>}
      </section>

      <section className="panel">
        <div className="panel-heading"><div><p className="eyebrow">Campaign ladder</p><h3>Internal targets by rehearsal</h3></div><Flag size={20} /></div>
        <div className="target-ladder">
          {fullMockTargets.map((target) => {
            const actual = chronological.find(
              (entry) => entry.milestoneWeek === target.week,
            );
            return (
              <article key={target.label} className={cx(actual && "has-result")}>
                <span>W{target.week}</span>
                <strong>{target.targetScore}%</strong>
                <p>{target.label}</p>
                <small>{actual ? `Actual ${actual.score}%` : "Awaiting evidence"}</small>
              </article>
            );
          })}
        </div>
      </section>

      {tracker.mockScores.length > 0 && (
        <section className="panel log-panel">
          <div className="panel-heading"><div><p className="eyebrow">Evidence history</p><h3>Recorded mocks</h3></div><FileText size={20} /></div>
          <div className="entry-list compact-entry-list">
            {sortByDateDesc(tracker.mockScores).map((entry) => (
              <article className="mock-entry" key={entry.id}>
                <div className="mock-score"><strong>{entry.score}%</strong></div>
                <div>
                  <span>{formatDate(entry.date)}</span><h4>{entry.label}</h4>{entry.note && <p>{entry.note}</p>}
                  {summarizeMockSections(entry).length > 0 && (
                    <ul className="mock-entry__sections" aria-label="Section results">
                      {summarizeMockSections(entry).map((section) => (
                        <li key={section.topic} className={cx(section.accuracy < 60 && "is-weak")}>{formatMockSection(section, topicShort)}</li>
                      ))}
                    </ul>
                  )}
                </div>
                {canManage && <button className="icon-button icon-button-danger" type="button" onClick={() => remove(entry.id)} aria-label="Delete mock"><Trash2 size={15} /></button>}
              </article>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
