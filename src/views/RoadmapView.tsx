// Moved out of App.tsx unchanged (P3.9 split); see git history for origin.
import { BookOpenCheck, Check, ChevronRight } from "lucide-react";
import { useRef, useState } from "react";
import { getWeekSessions, getWeekProgressForState, PHASES, PLAN } from "../data/plan";
import program from "../data/program.json";
import { READING_CATALOG } from "../data/readings";
import { formatDate, TOTAL_WEEKS } from "../lib/dates";
import { effectiveSessionDate, sessionDayLabel } from "../lib/schedule";
import { useHashSegment } from "../hooks/useHashTab";
import { parseWeekSegment, weekSegment } from "../lib/hashRoute";
import type { TrackerState } from "../types";
import type { TabId } from "../lib/navigation";
import { CHECKPOINT_TIME, ProgressBar, ReadingCoverage, cx, phaseShort } from "./shared";

export function RoadmapView({
  tracker,
  currentWeek,
  onNavigate,
}: {
  tracker: TrackerState;
  currentWeek: number;
  onNavigate: (tab: TabId, week?: number) => void;
}) {
  const [phase, setPhase] = useState("All phases");
  // Only mounted while Study Plan is the active tab, so the segment is ours.
  const [segment, setSegment] = useHashSegment("roadmap", "roadmap");
  const focusWeek = parseWeekSegment(segment, TOTAL_WEEKS);
  const openWeek = focusWeek ?? currentWeek;
  const scrolledTo = useRef<number | null>(null);
  const scrollToWeek = (node: HTMLDetailsElement | null, week: number) => {
    if (!node || focusWeek !== week || scrolledTo.current === week) return;
    scrolledTo.current = week;
    if (typeof node.scrollIntoView === "function") node.scrollIntoView({ block: "start" });
  };
  const visibleWeeks = phase === "All phases" ? PLAN : PLAN.filter((week) => week.phase === phase);
  const totalQuestions = PLAN.reduce((sum, week) => sum + week.questionTarget, 0);
  const plannedSessions = PLAN.flatMap(getWeekSessions);

  return (
    <div className="view-stack">
      <details className="tracker-secondary-tools">
        <summary>
          <span>Plan overview & filters</span>
          <small>{phase} · {visibleWeeks.length} weeks shown</small>
        </summary>
        <div className="tracker-secondary-tools__content">
      <section className="roadmap-summary panel">
        <div><strong>{PLAN.length}</strong><span>structured weeks</span></div>
        <div><strong>{plannedSessions.length}</strong><span>numbered tutor sessions</span></div>
        <div><strong>{READING_CATALOG.readings.length}</strong><span>official 2027 modules</span></div>
        <div><strong>{totalQuestions.toLocaleString()}</strong><span>practice target</span></div>
      </section>

      <div className="curriculum-note">
        <BookOpenCheck size={18} />
        <p>
          <strong>Built around the official 2027 CFA Level I curriculum.</strong>{" "}
          Open a week to see its assigned modules, independent work, Saturday checkpoint, practice target, and evidence gate.
        </p>
      </div>

      <div className="filter-row">
        <label>
          <span>Show phase</span>
          <select value={phase} onChange={(event) => setPhase(event.target.value)}>
            <option>All phases</option>
            {PHASES.map((item) => <option key={item}>{item}</option>)}
          </select>
        </label>
        <p>Open a week below to see its sessions and study tasks.</p>
      </div>
        </div>
      </details>

      <section className="timeline">
        {visibleWeeks.map((week) => {
          const progress = getWeekProgressForState(week, tracker);
          return (
            <details
              className={cx("timeline-week", week.week === currentWeek && "is-current")}
              key={week.week}
              open={week.week === openWeek}
              ref={(node) => scrollToWeek(node, week.week)}
              onToggle={(event) => { if (event.currentTarget.open) setSegment(weekSegment(week.week)); }}
            >
              <summary>
                <span className="timeline-index">{String(week.week).padStart(2, "0")}</span>
                <span className="timeline-summary-copy">
                  <small>{phaseShort(week.phase)} · {formatDate(week.startDate, { day: "numeric", month: "short" })}–{formatDate(week.endDate, { day: "numeric", month: "short" })}</small>
                  <strong>{week.focus}</strong>
                  <span>{week.topics.join(" · ")}</span>
                </span>
                <span className="timeline-progress"><strong>{progress}%</strong><ProgressBar value={progress} /></span>
                <span className="summary-chevron"><ChevronRight size={18} /></span>
              </summary>
              <div className="timeline-body">
                <div className="roadmap-columns">
                  <div>
                    <p className="mini-label">Week outcomes</p>
                    <ul className="outcome-list">
                      {week.outcomes.map((outcome) => <li key={outcome}><Check size={15} />{outcome}</li>)}
                    </ul>
                  </div>
                  <div className="evidence-contract">
                    <p className="mini-label">Evidence contract</p>
                    <div><span>Practice</span><strong>{week.questionTarget} questions</strong></div>
                    <div><span>Mastery gate</span><p>{week.masteryGate}</p></div>
                    {week.mockMilestone && <div><span>{week.mockMilestone.label}</span><p>{week.mockMilestone.instruction}</p></div>}
                  </div>
                </div>
                <div className="session-plan-grid">
                  {getWeekSessions(week).map((session) => (
                    <article key={session.number} className="session-plan-card">
                      <div><span>Session {String(session.number).padStart(2, "0")} · {sessionDayLabel(effectiveSessionDate(session, tracker.sessionOverrides))}</span><strong>{formatDate(effectiveSessionDate(session, tracker.sessionOverrides), { day: "numeric", month: "short" })} · {CHECKPOINT_TIME} · {session.durationMinutes} min</strong></div>
                      <h4>{session.title}</h4>
                      <p>{session.objective}</p>
                      {tracker.sessionOverrides[String(session.number)] && (
                        <small className="reschedule-note">Rescheduled from {formatDate(session.date, { day: "numeric", month: "short" })}: {tracker.sessionOverrides[String(session.number)]!.reason}</small>
                      )}
                      <ReadingCoverage week={week} session={session} />
                    </article>
                  ))}
                  {!getWeekSessions(week).length && (
                    <article className="session-plan-card">
                      <div><span>Exam-day milestone - 27 February</span><strong>No tutor session on exam day</strong></div>
                      <h4>Final checklist: protect the taper and execute</h4>
                      <ul className="outcome-list">
                        {program.examDayChecklist.map((item) => <li key={item}><Check size={15} />{item}</li>)}
                      </ul>
                    </article>
                  )}
                </div>
                <button className="button button-secondary" type="button" onClick={() => onNavigate("weekly", week.week)}>
                  Open Week {week.week} checklist <ChevronRight size={16} />
                </button>
              </div>
            </details>
          );
        })}
      </section>
    </div>
  );
}
