import { Lightbulb } from "lucide-react";
import type { InsightSuggestion, ModuleStanding, PaceReport } from "../../lib/tutorInsights";
import "./tutorConsole.css";

const percent = (value: number | null) => (value === null ? "–" : `${Math.round(value * 100)}%`);

/** Pace against the plan, the weakest modules and what to do about them. */
export function TutorInsights({
  pace,
  standings,
  suggestions,
  loading,
  onSuggestion,
}: {
  pace: PaceReport;
  standings: readonly ModuleStanding[];
  suggestions: readonly InsightSuggestion[];
  loading: boolean;
  onSuggestion: (suggestion: InsightSuggestion) => void;
}) {
  const weakest = standings.slice(0, 5);
  const practiceExpected = Math.round(pace.practiceTarget * pace.weekElapsed);
  return (
    <section className="panel coach-insights" aria-labelledby="coach-insights-title">
      <div className="panel-heading">
        <div><p className="eyebrow">Student insights</p><h3 id="coach-insights-title">{pace.week > 0 ? `Week ${pace.week} pace` : "Before the plan starts"}</h3></div>
        <Lightbulb size={21} aria-hidden="true" />
      </div>
      {loading ? <p className="fine-print">Loading…</p> : (
        <>
          <dl className="coach-insights__pace">
            <div><dt>Plan tests taken</dt><dd>{pace.testsDone} of {pace.testsDue.length}</dd></div>
            <div><dt>Practice this week</dt><dd>{pace.practiceThisWeek} of {pace.practiceTarget}{pace.practiceTarget ? <small> ~{practiceExpected} by now</small> : null}</dd></div>
            <div><dt>Last practice</dt><dd>{pace.daysSinceLastPractice === null ? "None yet" : pace.daysSinceLastPractice === 0 ? "Today" : `${pace.daysSinceLastPractice} ${pace.daysSinceLastPractice === 1 ? "day" : "days"} ago`}</dd></div>
            <div><dt>Exam</dt><dd>{pace.daysToExam} days</dd></div>
          </dl>
          {suggestions.length > 0 && (
            <ul className="coach-insights__suggestions">
              {suggestions.map((suggestion) => (
                <li key={suggestion.id}>
                  <span>{suggestion.text}</span>
                  <button type="button" className="button button-secondary" onClick={() => onSuggestion(suggestion)}>{suggestion.actionLabel}</button>
                </li>
              ))}
            </ul>
          )}
          {weakest.length > 0 ? (
            <table className="coach-insights__modules">
              <caption>Weakest modules (test score blended with practice accuracy)</caption>
              <thead><tr><th scope="col">Module</th><th scope="col">Test</th><th scope="col">Practice</th></tr></thead>
              <tbody>
                {weakest.map((standing) => (
                  <tr key={standing.catalogId} className={standing.weak ? "is-weak" : undefined}>
                    <th scope="row">{standing.label}</th>
                    <td>{standing.test && standing.test.score !== null ? `${standing.test.code} ${standing.test.score}/8` : "–"}</td>
                    <td>{standing.practiceAnswered ? `${percent(standing.practiceAccuracy)} of ${standing.practiceAnswered}` : "–"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <p className="fine-print">Module standings appear once Hamad takes a test or answers practice questions.</p>}
        </>
      )}
    </section>
  );
}
