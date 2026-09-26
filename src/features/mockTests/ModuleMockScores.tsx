import { ClipboardCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { MOCK_MODULES } from "../../data/mockModules";
import { getMockAttempt, listMockAttempts } from "../../lib/cloudMockTests";
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
  const rows = MOCK_MODULES.map(module => ({
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
      <ol className="mock-scores__list">
        {rows.map(({ module, attempt }) => {
          const view = mockAttemptView(attempt, Date.now());
          const percent = attempt?.score != null ? Math.round((attempt.score / MOCK_QUESTION_COUNT) * 100) : null;
          const used = attempt ? mockTimeUsedMs(attempt) : null;
          return (
            <li key={module.id} className={`mock-scores__row mock-scores__row--${view}`}>
              <span className="mock-scores__module">M{module.number}</span>
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
