// Moved out of App.tsx unchanged (P3.9 split); see git history for origin.
import { BookOpenCheck, Check, ChevronRight } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { getWeekSessions, getWeekProgressForState, PHASES, PLAN } from "../data/plan";
import program from "../data/program.json";
import { READING_CATALOG } from "../data/readings";
import { formatDate, TOTAL_WEEKS } from "../lib/dates";
import { effectiveSessionDate, sessionDayLabel } from "../lib/schedule";
import type { TrackerState } from "../types";
import { CHECKPOINT_TIME, ProgressBar, ReadingCoverage, cx, phaseShort } from "./shared";

export function RoadmapView({
  tracker,
  currentWeek,
  focusWeek,
  onFocusWeek,
  onOpenWeek,
}: {
  tracker: TrackerState;
  currentWeek: number;
  /** The week a link points at (from the host's hash segment); opened and scrolled to. */
  focusWeek: number | null;
  /** A week was opened here; the host records it in its hash segment. */
  onFocusWeek: (week: number) => void;
  /** "Open Week N checklist". */
  onOpenWeek: (week: number) => void;
}) {
  const [phase, setPhase] = useState("All phases");
  const openWeek = focusWeek ?? currentWeek;
  const weekNodes = useRef(new Map<number, HTMLDetailsElement>());
  const scrolledTo = useRef<number | null>(null);
  // A week opened here by hand (a click on its summary, which keyboard
  // activation also fires) is recorded in the link too; do not jump to it.
  const openedHere = useRef<number | null>(null);
  // Scroll to a linked week after the page has painted: scrolling while the
  // view is still being swapped in (tab switch, view transition) was lost,
  // so `#roadmap/week-12` opened week 12 but left the page at the top.
  useEffect(() => {
    if (!focusWeek || scrolledTo.current === focusWeek) return;
    scrolledTo.current = focusWeek;
    if (openedHere.current === focusWeek || typeof window === "undefined") return;
    // A task after the commit (not an animation frame, which a hidden page
    // never runs), once the opened week has been laid out.
    const timer = window.setTimeout(() => {
      const node = weekNodes.current.get(focusWeek);
      // Instant: the page scrolls smoothly by default, and a smooth scroll
      // is cut short when the opened week's content lays out mid-way.
      if (node && typeof node.scrollIntoView === "function") node.scrollIntoView({ block: "start", behavior: "instant" });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [focusWeek]);
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
              ref={(node) => {
                if (node) weekNodes.current.set(week.week, node);
                else weekNodes.current.delete(week.week);
              }}
              onToggle={(event) => { if (event.currentTarget.open) onFocusWeek(week.week); }}
            >
              <summary onClick={() => { openedHere.current = week.week; }}>
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
                <button className="button button-secondary" type="button" onClick={() => onOpenWeek(week.week)}>
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
