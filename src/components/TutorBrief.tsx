import { ChevronDown, ClipboardList } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { usePracticeSnapshot } from "../hooks/usePracticeSnapshot";
import { formatDate, todayDateOnly } from "../lib/dates";
import type { MockAttempt } from "../lib/mockTestContent";
import { buildTutorBrief, type TutorBrief } from "../lib/tutorBrief";
import type { TrackerState } from "../types";

function shorten(text: string, limit = 140): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > limit ? `${clean.slice(0, limit - 1)}…` : clean;
}

export function TutorBriefContent({ brief, practiceStatus, testsStatus }: {
  brief: TutorBrief;
  practiceStatus: "loading" | "ready" | "unavailable";
  testsStatus: "loading" | "ready" | "unavailable";
}) {
  const { practice } = brief;
  return (
    <div className="tutor-brief__body">
      <dl className="tutor-brief__stats">
        <div>
          <dt>Practice answered</dt>
          <dd>{practiceStatus === "ready" ? practice.answered : "—"}<small>{practiceStatus === "ready" ? (practice.accuracy === null ? "No practice in this window" : `${practice.accuracy}% correct · ${practice.runs} ${practice.runs === 1 ? "set" : "sets"}`) : practiceStatus === "loading" ? "Loading…" : "Unavailable"}</small></dd>
        </div>
        <div>
          <dt>Module tests</dt>
          <dd>{testsStatus === "ready" ? brief.moduleTests.length : "—"}<small>{testsStatus === "ready" ? "submitted in this window" : testsStatus === "loading" ? "Loading…" : "Unavailable"}</small></dd>
        </div>
        <div>
          <dt>Overdue plan work</dt>
          <dd>{brief.overdue.count}<small>{brief.overdue.count ? "required items" : "Nothing overdue"}</small></dd>
        </div>
        <div>
          <dt>Retests due</dt>
          <dd>{brief.dueRetests}<small>in Mistake Review</small></dd>
        </div>
      </dl>

      {practice.byModule.length > 0 && (
        <section>
          <h4>Weakest modules practised</h4>
          <ul className="tutor-brief__list">
            {practice.byModule.map((line) => (
              <li key={line.moduleId}><strong>{line.moduleId}</strong><span>{line.accuracy}% · {line.correct}/{line.attempted}</span></li>
            ))}
          </ul>
        </section>
      )}

      {brief.topMisses.length > 0 && (
        <section>
          <h4>Most-missed questions</h4>
          <ol className="tutor-brief__list">
            {brief.topMisses.map((miss) => (
              <li key={miss.questionId}>
                <strong>{miss.prompt ? shorten(miss.prompt) : miss.questionId}</strong>
                <span>{miss.moduleId ?? "Unlisted module"} · missed {miss.misses}×</span>
              </li>
            ))}
          </ol>
        </section>
      )}

      {brief.moduleTests.length > 0 && (
        <section>
          <h4>Module test results</h4>
          <ul className="tutor-brief__list">
            {brief.moduleTests.map((test) => (
              <li key={`${test.moduleId}-${test.submittedAtMs}`}>
                <strong>{test.title}</strong>
                <span>{test.score === null ? "Awaiting grading" : `${test.score}/${test.outOf}`} · {formatDate(new Date(test.submittedAtMs).toISOString().slice(0, 10), { day: "numeric", month: "short" })}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {(brief.overdue.oldest.length > 0 || brief.signals.length > 0) && (
        <section>
          <h4>Worth raising</h4>
          <ul className="tutor-brief__list">
            {brief.overdue.oldest.map((item) => <li key={item}><strong>{item}</strong><span>Overdue</span></li>)}
            {brief.signals.map((signal) => <li key={signal.id}><strong>{signal.title}</strong><span>{signal.action}</span></li>)}
          </ul>
        </section>
      )}
    </div>
  );
}

/**
 * The tutor's pre-session brief: what the student did since the last
 * logged lesson. Read-only; loads the student's practice runs and module
 * test attempts with the tutor's existing read access.
 */
export function TutorBriefPanel({ tracker, defaultOpen = true }: { tracker: TrackerState; defaultOpen?: boolean }) {
  const practice = usePracticeSnapshot({ role: "tutor", uid: "tutor", includeRuns: true });
  const [attempts, setAttempts] = useState<MockAttempt[] | null>(null);
  const [testsFailed, setTestsFailed] = useState(false);

  useEffect(() => {
    let active = true;
    import("../lib/cloudMockTests")
      .then(({ listMockAttempts }) => listMockAttempts())
      .then((list) => { if (active) setAttempts(list); })
      .catch(() => { if (active) setTestsFailed(true); });
    return () => { active = false; };
  }, []);

  const today = todayDateOnly();
  const brief = useMemo(() => buildTutorBrief({
    tracker,
    questions: practice.questions,
    runs: practice.runs,
    mockAttempts: attempts ?? [],
    studentUid: practice.studentUid,
    today,
  }), [attempts, practice.questions, practice.runs, practice.studentUid, today, tracker]);

  return (
    <details className="tutor-brief" open={defaultOpen}>
      <summary>
        <ClipboardList size={18} aria-hidden="true" />
        <span>
          <strong>Since the last lesson</strong>
          <small>
            From {formatDate(brief.since, { day: "numeric", month: "short" })} · {brief.sinceSource === "last-session" ? "last logged session" : "last 7 days (no session logged yet)"}
          </small>
        </span>
        <ChevronDown size={16} aria-hidden="true" />
      </summary>
      <TutorBriefContent
        brief={brief}
        practiceStatus={practice.status}
        testsStatus={testsFailed ? "unavailable" : attempts ? "ready" : "loading"}
      />
    </details>
  );
}
