// Moved out of App.tsx unchanged (P3.9 split); see git history for origin.
import { CalendarDays, Clock3, FileText, Flag, GraduationCap, Plus, ShieldCheck, Trash2 } from "lucide-react";
import { type FormEvent, useState } from "react";
import { getWeekSessions, PLAN } from "../data/plan";
import { formatDate } from "../lib/dates";
import { effectiveSessionDate, sessionDayLabel } from "../lib/schedule";
import { useAppDialog } from "../components/AppDialog";
import type { SessionLog, TrackerState } from "../types";
import { CHECKPOINT_TIME, EmptyState, MiniMetric, PLANNED_SESSIONS, ReadingCoverage, makeId, sortByDateDesc } from "./shared";
import type { Notify, UpdateTracker } from "./shared";

export function SessionLogView({
  tracker,
  currentWeek,
  updateTracker,
  notify,
  canManage,
}: {
  tracker: TrackerState;
  currentWeek: number;
  updateTracker: UpdateTracker;
  notify: Notify;
  canManage: boolean;
}) {
  const dialog = useAppDialog();
  const initialPlannedSession =
    getWeekSessions(PLAN[currentWeek - 1]!)[0] ??
    PLANNED_SESSIONS.at(-1)!.session;
  const [form, setForm] = useState({
    date: effectiveSessionDate(initialPlannedSession, tracker.sessionOverrides),
    sessionNumber: initialPlannedSession.number,
    week: currentWeek,
    type: "Tutor session",
    durationMinutes: initialPlannedSession.durationMinutes,
    focus: "",
    outcome: "",
    nextAction: "",
  });
  const plannedSelection = PLANNED_SESSIONS.find(
    (item) => item.session.number === form.sessionNumber,
  ) ?? PLANNED_SESSIONS[0]!;
  const totalMinutes = tracker.sessionLogs.reduce((sum, log) => sum + log.durationMinutes, 0);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!canManage) return;
    const entry: SessionLog = { id: makeId("session"), ...form };
    updateTracker((current) => ({ ...current, sessionLogs: [entry, ...current.sessionLogs] }));
    setForm((current) => ({ ...current, focus: "", outcome: "", nextAction: "" }));
    notify("Tutor session logged.");
  };

  const remove = async (id: string) => {
    if (!await dialog.confirm("Delete this session log?")) return;
    updateTracker((current) => ({ ...current, sessionLogs: current.sessionLogs.filter((entry) => entry.id !== id) }));
  };

  return (
    <div className="view-stack">
      <section className="mini-metric-grid">
        <MiniMetric label="Sessions logged" value={String(tracker.sessionLogs.length)} icon={GraduationCap} />
        <MiniMetric label="Tutor hours" value={(totalMinutes / 60).toFixed(1)} icon={Clock3} />
        <MiniMetric label="Weeks represented" value={String(new Set(tracker.sessionLogs.map((log) => log.week)).size)} icon={CalendarDays} />
      </section>

      <section className="form-and-list">
        {canManage ? <form className="panel entry-form" onSubmit={submit}>
          <div className="panel-heading"><div><p className="eyebrow">New evidence</p><h3>Log a tutor session</h3></div><Plus size={20} /></div>
          <div className="form-grid form-grid-2">
            <label><span>Date</span><input type="date" required value={form.date} onChange={(event) => setForm({ ...form, date: event.target.value })} /></label>
            <label><span>Minutes</span><input type="number" min="15" max="240" required value={form.durationMinutes} onChange={(event) => setForm({ ...form, durationMinutes: Number(event.target.value) })} /></label>
          </div>
          <label><span>Planned session</span><select value={form.sessionNumber} onChange={(event) => {
            const sessionNumber = Number(event.target.value);
            const selected = PLANNED_SESSIONS.find((item) => item.session.number === sessionNumber)!;
            setForm({
              ...form,
              date: effectiveSessionDate(selected.session, tracker.sessionOverrides),
              sessionNumber,
              week: selected.week.week,
              type: "Tutor session",
              durationMinutes: selected.session.durationMinutes,
            });
          }}>{PLANNED_SESSIONS.map(({ week, session }) => <option key={session.number} value={session.number}>Session {String(session.number).padStart(2, "0")} · {sessionDayLabel(effectiveSessionDate(session, tracker.sessionOverrides))} {formatDate(effectiveSessionDate(session, tracker.sessionOverrides), { day: "numeric", month: "short" })} at {CHECKPOINT_TIME} · W{week.week} · {session.title}</option>)}</select></label>
          <ReadingCoverage week={plannedSelection.week} session={plannedSelection.session} />
          <label><span>Focus</span><input required maxLength={120} placeholder="What did this session attack?" value={form.focus} onChange={(event) => setForm({ ...form, focus: event.target.value })} /></label>
          <label><span>What changed?</span><textarea required rows={3} maxLength={600} placeholder="The observable breakthrough, decision, or remaining gap." value={form.outcome} onChange={(event) => setForm({ ...form, outcome: event.target.value })} /></label>
          <label><span>Next action</span><textarea required rows={2} maxLength={400} placeholder="Specific work to complete before the next session." value={form.nextAction} onChange={(event) => setForm({ ...form, nextAction: event.target.value })} /></label>
          <button className="button button-primary" type="submit"><Plus size={16} /> Save session</button>
        </form> : <article className="panel read-only-panel"><ShieldCheck size={22} /><div><p className="eyebrow">Student view</p><h3>Tutor session records are tutor-managed</h3><p>You can review every recorded outcome and next action below. Mohamed controls additions and corrections.</p></div></article>}

        <section className="panel log-panel">
          <div className="panel-heading"><div><p className="eyebrow">History</p><h3>Session record</h3></div><FileText size={20} /></div>
          {tracker.sessionLogs.length ? (
            <div className="entry-list">
              {sortByDateDesc(tracker.sessionLogs).map((entry) => (
                <article className="log-entry" key={entry.id}>
                  <div className="log-entry-top"><div><span>{entry.sessionNumber ? `Session ${String(entry.sessionNumber).padStart(2, "0")} · ` : ""}Week {entry.week} · {entry.type}</span><strong>{entry.focus}</strong></div>{canManage && <button className="icon-button icon-button-danger" type="button" onClick={() => remove(entry.id)} aria-label="Delete session"><Trash2 size={15} /></button>}</div>
                  <p>{entry.outcome}</p>
                  <div className="next-action"><Flag size={15} /><span><strong>Next:</strong> {entry.nextAction}</span></div>
                  <footer>{formatDate(entry.date)} · {entry.durationMinutes} minutes</footer>
                </article>
              ))}
            </div>
          ) : <EmptyState icon={GraduationCap} title="No sessions logged yet">The first entry should record what changed and what happens next.</EmptyState>}
        </section>
      </section>
    </div>
  );
}
