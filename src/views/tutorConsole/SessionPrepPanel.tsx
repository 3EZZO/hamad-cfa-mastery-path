import { BellRing, ClipboardList, Copy, PlayCircle } from "lucide-react";
import { formatDate } from "../../lib/dates";
import { sessionPrepText, type SessionPrep } from "../../lib/sessionPrep";
import { consoleAnchor } from "../../lib/tutorConsole";
import "./tutorConsole.css";

const percent = (value: number | null) => (value === null ? "–" : `${Math.round(value * 100)}%`);

/** The next session's agenda, ready to copy, with the actions that usually follow. */
export function SessionPrepPanel({
  prep,
  loading,
  onCopy,
  onRemind,
  onOpenSessionMode,
}: {
  prep: SessionPrep | null;
  loading: boolean;
  onCopy: (text: string) => void;
  onRemind: (moduleIds: string[]) => void;
  onOpenSessionMode?: () => void;
}) {
  if (!prep) return null;
  const dateLabel = formatDate(prep.session.date, { weekday: "short", day: "numeric", month: "short" });
  const toTake = prep.tests.filter((test) => test.state === "to-take").map((test) => test.id);
  return (
    <section className="panel coach-prep" id={consoleAnchor.prep} aria-labelledby="coach-prep-title">
      <div className="panel-heading">
        <div><p className="eyebrow">Session prep</p><h3 id="coach-prep-title">Session {String(prep.session.number).padStart(2, "0")} · {dateLabel}</h3><p className="fine-print">{prep.session.title}</p></div>
        <ClipboardList size={21} aria-hidden="true" />
      </div>
      {loading ? <p className="fine-print">Loading…</p> : (
        <div className="coach-prep__grid">
          <div>
            <h4>{prep.since ? `Since ${formatDate(prep.since, { day: "numeric", month: "short" })}` : "So far"}</h4>
            <p>{prep.results.length ? prep.results.map((result) => `${result.code} ${result.score === null ? "ungraded" : `${result.score}/8`}`).join(" · ") : "No tests taken"}</p>
            <p>Practice: {prep.practice.answered} answered{prep.practice.answered ? `, ${percent(prep.practice.accuracy)} correct` : ""}</p>
          </div>
          <div>
            <h4>Focus</h4>
            {prep.focus.length ? <ul>{prep.focus.map((standing) => <li key={standing.catalogId}>{standing.label}</li>)}</ul> : <p>No weak modules flagged</p>}
            {prep.overdue.length > 0 && <p className="is-attention">Overdue: {prep.overdue.join(", ")}</p>}
          </div>
          <div>
            <h4>This session</h4>
            {prep.readings.length ? <ul>{prep.readings.map((reading) => <li key={reading}>{reading}</li>)}</ul> : <p>No readings listed</p>}
            {prep.tests.length > 0 && <p>Tests: {prep.tests.map((test) => `${test.code} ${test.state === "taken" ? (test.score === null ? "taken" : `${test.score}/8`) : test.state === "to-take" ? "to take" : "not published"}`).join(" · ")}</p>}
          </div>
        </div>
      )}
      <div className="inline-actions">
        <button type="button" className="button button-secondary" onClick={() => onCopy(sessionPrepText(prep, dateLabel))}><Copy size={16} /> Copy agenda</button>
        {toTake.length > 0 && <button type="button" className="button button-secondary" onClick={() => onRemind(toTake)}><BellRing size={16} /> Remind about {toTake.length === 1 ? "its test" : `its ${toTake.length} tests`}</button>}
        {onOpenSessionMode && <button type="button" className="button button-primary" onClick={onOpenSessionMode}><PlayCircle size={16} /> Open Session Mode</button>}
      </div>
    </section>
  );
}
