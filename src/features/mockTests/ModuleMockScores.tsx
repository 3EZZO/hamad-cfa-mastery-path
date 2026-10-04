import { ClipboardCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { MOCK_MODULES, MOCK_TOPICS, mockModuleCode } from "../../data/mockModules";
import { getMockAttempt, listMockAttempts } from "../../lib/cloudMockTests";
import { topicScoreTrends } from "../../lib/mockTrends";
import { WEAK_SCORE } from "../../lib/testBoard";
import {
  MOCK_QUESTION_COUNT,
  formatMockClock,
  mockAttemptView,
  mockTimeUsedMs,
  type MockAttempt,
} from "../../lib/mockTestContent";
import type { ProjectRole } from "../../lib/permissions";
import "./moduleMock.css";

/** Module mock scores beside the full-mock trend in Mock Results. */
export function ModuleMockScores({ uid, role }: { uid: string; role: ProjectRole }) {
  const [attempts, setAttempts] = useState<MockAttempt[] | null>(null);

  useEffect(() => {
    let alive = true;
    const load = role === "tutor"
      ? listMockAttempts()
      : Promise.all(MOCK_MODULES.map(module => getMockAttempt(uid, module.id).catch(() => null)))
        .then(list => list.filter((entry): entry is MockAttempt => entry !== null));
    load.then(list => { if (alive) setAttempts(list); }, () => { if (alive) setAttempts([]); });
    return () => { alive = false; };
  }, [role, uid]);

  if (!attempts) return null;
  // Only topics with at least one attempt get rows (Quant before any attempt
  // exists), so untouched topics do not pad the table with dashes.
  const attempted = MOCK_TOPICS.filter(topic => attempts.some(entry => MOCK_MODULES.some(module => module.topic === topic && module.id === entry.moduleId)));
  const shown = attempted.length > 0 ? attempted : MOCK_TOPICS.slice(0, 1);
  const trends = topicScoreTrends(attempts);
  const rows = MOCK_MODULES.filter(module => shown.includes(module.topic)).map(module => ({
    module,
    attempt: attempts.find(entry => entry.moduleId === module.id && entry.status !== "active")
      ?? attempts.find(entry => entry.moduleId === module.id)
      ?? null,
  }));

  return (
    <section className="panel mock-scores" aria-labelledby="mock-scores-title">
      <div className="panel-heading">
        <div><p className="eyebrow">Compulsory module assessments</p><h3 id="mock-scores-title">Module mock scores</h3></div>
        <ClipboardCheck size={21} />
      </div>
      {trends.length > 0 && (
        <div className="mock-trends">
          {trends.map(trend => {
            const headingId = `mock-trend-${trend.topic.toLowerCase().replace(/\W+/g, "-")}`;
            return (
              <section key={trend.topic} className="mock-trend" aria-labelledby={headingId}>
                <div className="mock-trend__head">
                  <strong id={headingId}>{trend.topic}</strong>
                  <span>avg {trend.averageScore.toFixed(1)}/{MOCK_QUESTION_COUNT} · {trend.graded} graded</span>
                </div>
                <span className="mock-trend__bar" aria-hidden="true"><i style={{ width: `${(trend.averageScore / MOCK_QUESTION_COUNT) * 100}%` }} /></span>
                <ol className="mock-trend__recent" aria-label={`Latest ${trend.recent.length} ${trend.topic} scores, oldest first`}>
                  {trend.recent.map(score => (
                    <li key={score.moduleId} className={score.score < WEAK_SCORE ? "is-weak" : ""} title={score.title}>
                      <span className="mock-trend__column" aria-hidden="true"><i style={{ height: `${(score.score / MOCK_QUESTION_COUNT) * 100}%` }} /></span>
                      <strong>{score.score}/{MOCK_QUESTION_COUNT}</strong>
                      <small>{score.code}</small>
                    </li>
                  ))}
                </ol>
              </section>
            );
          })}
        </div>
      )}
      <ol className="mock-scores__list">
        {rows.map(({ module, attempt }) => {
          const view = mockAttemptView(attempt, Date.now());
          const percent = attempt?.score != null ? Math.round((attempt.score / MOCK_QUESTION_COUNT) * 100) : null;
          const used = attempt ? mockTimeUsedMs(attempt) : null;
          return (
            <li key={module.id} className={`mock-scores__row mock-scores__row--${view}`}>
              <span className="mock-scores__module">{mockModuleCode(module)}</span>
              <span className="mock-scores__title">{module.title}</span>
              <span className="mock-scores__bar" aria-hidden="true"><i style={{ width: `${percent ?? 0}%` }} /></span>
              <strong className="mock-scores__value">
                {view === "forfeited" ? "Forfeited" : percent !== null ? `${attempt!.score}/${MOCK_QUESTION_COUNT}` : view === "not-started" ? "—" : view === "in-progress" ? "In progress" : "Grading"}
              </strong>
              <small>{used !== null ? formatMockClock(used) : ""}{attempt && attempt.incidents.length > 0 && role === "tutor" ? ` · ${attempt.incidents.length} incidents` : ""}</small>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
