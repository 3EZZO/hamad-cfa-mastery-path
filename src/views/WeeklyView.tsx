// Moved out of App.tsx unchanged (P3.9 split); see git history for origin.
import { Check, ChevronLeft, ChevronRight, Copy, ListChecks, Printer } from "lucide-react";
import { getPlanTasks, getWeekSessions, getWeekProgressForState, PLAN } from "../data/plan";
import { formatDate, todayDateOnly, TOTAL_WEEKS } from "../lib/dates";
import { isTaskComplete } from "../lib/taskStatus";
import { effectiveSessionDate, sessionDayLabel } from "../lib/schedule";
import { buildWeeklyReport, formatWeeklyReportText, printWeeklyReport } from "../lib/weeklyReport";
import type { TrackerState } from "../types";
import { CHECKPOINT_TIME, ProgressBar, ReadingCoverage, TaskChecklist } from "./shared";
import type { Notify } from "./shared";

export function WeeklyView({
  tracker,
  selectedWeek,
  setSelectedWeek,
  onToggleTask,
  notify,
  role,
}: {
  tracker: TrackerState;
  selectedWeek: number;
  setSelectedWeek: (week: number) => void;
  onToggleTask: (id: string) => void;
  notify: Notify;
  role: "tutor" | "student";
}) {
  const week = PLAN[selectedWeek - 1]!;
  const tasks = getPlanTasks(week, tracker.sessionOverrides);
  const required = tasks.filter((task) => !task.optional);
  const completed = required.filter((task) => isTaskComplete(task, tracker)).length;
  const progress = getWeekProgressForState(week, tracker);
  const report = buildWeeklyReport(week, tracker, todayDateOnly());

  const copyReport = async () => {
    try {
      await navigator.clipboard.writeText(formatWeeklyReportText(report));
      notify("Weekly report copied for WhatsApp.");
    } catch {
      notify("Clipboard access was blocked by the browser.", "warning");
    }
  };

  const printReport = () => {
    try {
      printWeeklyReport(report);
    } catch (error) {
      notify(error instanceof Error ? error.message : "Unable to open the report.", "warning");
    }
  };

  return (
    <div className="view-stack">
      <section className="week-selector panel">
        <button className="icon-button" type="button" disabled={selectedWeek === 1} onClick={() => setSelectedWeek(selectedWeek - 1)} aria-label="Previous week"><ChevronLeft size={19} /></button>
        <label>
          <span>Selected week</span>
          <select value={selectedWeek} onChange={(event) => setSelectedWeek(Number(event.target.value))}>
            {PLAN.map((item) => <option value={item.week} key={item.week}>Week {item.week} · {item.focus}</option>)}
          </select>
        </label>
        <button className="icon-button" type="button" disabled={selectedWeek === TOTAL_WEEKS} onClick={() => setSelectedWeek(selectedWeek + 1)} aria-label="Next week"><ChevronRight size={19} /></button>
        <div className="week-report-actions">
          <button className="button button-secondary" type="button" onClick={() => void copyReport()}><Copy size={16} /> Copy report</button>
          <button className="button button-secondary" type="button" onClick={printReport}><Printer size={16} /> Print / PDF</button>
        </div>
      </section>

      <section className="week-hero panel">
        <div className="week-number"><span>WEEK</span><strong>{String(week.week).padStart(2, "0")}</strong></div>
        <div className="week-hero-copy">
          <p className="eyebrow">{week.phase}</p>
          <h1>{week.focus}</h1>
          <p>{formatDate(week.startDate)} — {formatDate(week.endDate)}</p>
          <div className="topic-pills">{week.topics.map((topic) => <span key={topic}>{topic}</span>)}</div>
          <div className="session-date-pills">
            {getWeekSessions(week).map((session) => (
              <span key={session.number}><strong>S{String(session.number).padStart(2, "0")}</strong>{sessionDayLabel(effectiveSessionDate(session, tracker.sessionOverrides))} · {formatDate(effectiveSessionDate(session, tracker.sessionOverrides), { day: "numeric", month: "short" })} · {CHECKPOINT_TIME}</span>
            ))}
          </div>
        </div>
        <div className="week-score">
          <strong>{progress}%</strong>
          <span>{completed} of {required.length} required</span>
          <ProgressBar value={progress} />
        </div>
      </section>

      <section className="weekly-grid">
        <article className="panel panel-large">
          <div className="panel-heading">
            <div><p className="eyebrow">Step by step</p><h3>This week's checklist</h3></div>
            <ListChecks size={21} />
          </div>
          <TaskChecklist tasks={tasks} tracker={tracker} role={role} onToggle={onToggleTask} />
        </article>

        <div className="weekly-side-stack">
          <article className="panel evidence-contract">
            <p className="eyebrow">Evidence contract</p>
            <div><span>Question target</span><strong>{week.questionTarget}</strong></div>
            <div><span>Mastery gate</span><p>{week.masteryGate}</p></div>
            {week.mockMilestone && <div><span>{week.mockMilestone.label}</span><p>{week.mockMilestone.instruction}</p></div>}
          </article>
          <article className="panel">
            <p className="eyebrow">Week outcomes</p>
            <ul className="outcome-list">
              {week.outcomes.map((outcome) => <li key={outcome}><Check size={15} />{outcome}</li>)}
            </ul>
          </article>
          <article className="panel weekly-readings">
            <p className="eyebrow">Official 2027 modules</p>
            {getWeekSessions(week).map((session) => (
              <div key={session.number}>
                <strong>Session {String(session.number).padStart(2, "0")} · {sessionDayLabel(effectiveSessionDate(session, tracker.sessionOverrides))}, {formatDate(effectiveSessionDate(session, tracker.sessionOverrides), { day: "numeric", month: "short" })} at {CHECKPOINT_TIME}</strong>
                {tracker.sessionOverrides[String(session.number)] && (
                  <small className="reschedule-note">Rescheduled from {sessionDayLabel(session.date)}, {formatDate(session.date)}: {tracker.sessionOverrides[String(session.number)]!.reason}</small>
                )}
                <ReadingCoverage week={week} session={session} />
              </div>
            ))}
            {!getWeekSessions(week).length && (
              <p className="fine-print">All 102 modules were assigned before exam week. This week contains independent taper and exam-execution tasks only.</p>
            )}
          </article>
        </div>
      </section>
    </div>
  );
}
