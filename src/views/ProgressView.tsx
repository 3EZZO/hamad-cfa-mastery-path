import { ArrowRight, Grid3x3, TrendingUp, X } from "lucide-react";
import { Suspense, useMemo, useState } from "react";
import { formatExamWeight } from "../data/examWeights";
import { usePracticeSnapshot } from "../hooks/usePracticeSnapshot";
import { formatDate } from "../lib/dates";
import { buildModuleHeatmap, STALE_DAYS, taughtCatalogIds, type HeatmapCell, type HeatmapState } from "../lib/moduleHeatmap";
import { buildPracticeInsights } from "../lib/practiceInsights";
import { ModuleMockScores } from "../lazyViews";
import type { TrackerState } from "../types";
import { MasteryView } from "./MasteryView";
import { MockView } from "./MockView";
import { SectionPanel, SectionTabs, cx, topicShort } from "./shared";
import type { Notify, UpdateTracker } from "./shared";

/** Module tests are taken on the Tests destination; Mocks lists their scores. */
export type ProgressSection = "topics" | "mocks";

const SECTIONS: Array<{ id: ProgressSection; label: string; icon: typeof Grid3x3 }> = [
  { id: "topics", label: "Topics", icon: Grid3x3 },
  { id: "mocks", label: "Mocks", icon: TrendingUp },
];

export function parseProgressSection(segment: string): ProgressSection {
  return SECTIONS.some((section) => section.id === segment) ? (segment as ProgressSection) : "topics";
}

const STATE_LABEL: Record<HeatmapState, string> = {
  none: "No questions yet",
  new: "Not practised",
  repair: "Repair",
  building: "Building",
  ready: "Ready",
};

function cellDescription(cell: HeatmapCell): string {
  const parts = [`${cell.label} ${cell.title}`, STATE_LABEL[cell.state]];
  if (cell.accuracy !== null) parts.push(`${cell.accuracy}% over ${cell.attempted} attempts`);
  if (cell.stale) parts.push(`not practised for ${STALE_DAYS}+ days`);
  if (cell.taught) parts.push("taught");
  return parts.join(", ");
}

function ModuleHeatmapPanel({
  tracker,
  role,
  uid,
  onPracticeModule,
}: {
  tracker: TrackerState;
  role: "tutor" | "student";
  uid: string;
  onPracticeModule: (moduleId: string) => void;
}) {
  const practice = usePracticeSnapshot({ role, uid });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const heatmap = useMemo(() => {
    const insights = buildPracticeInsights({ questions: practice.questions, states: practice.states, runs: [] });
    return buildModuleHeatmap({ modules: insights.modules, taught: taughtCatalogIds(tracker) });
  }, [practice.questions, practice.states, tracker]);
  const practised = heatmap.rows.reduce((sum, row) => sum + row.practisedModules, 0);
  const total = heatmap.rows.reduce((sum, row) => sum + row.cells.length, 0);

  return (
    <section className="panel heatmap-panel" aria-labelledby="heatmap-heading">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Practice evidence by module · ordered by exam weight</p>
          <h3 id="heatmap-heading">Module heatmap</h3>
        </div>
        <div className="heatmap-summary">
          <strong>{heatmap.weightedAccuracy === null ? "—" : `${heatmap.weightedAccuracy}%`}</strong>
          <span>exam-weighted accuracy · {practised}/{total} modules practised</span>
        </div>
      </div>
      <ul className="heatmap-legend" aria-label="Legend">
        {(["ready", "building", "repair", "new", "none"] as const).map((state) => (
          <li key={state}><i className={`heatmap-swatch is-${state}`} aria-hidden="true" />{STATE_LABEL[state]}</li>
        ))}
        <li><i className="heatmap-swatch is-ready is-stale" aria-hidden="true" />Not practised for {STALE_DAYS}+ days</li>
      </ul>
      {practice.status === "loading" && <p className="heatmap-status" role="status">Loading practice evidence…</p>}
      {practice.status === "unavailable" && (
        <p className="heatmap-status" role="status">
          Practice evidence is not available here yet. {role === "student" ? "Open Practice once while online to load it onto this device." : "Check the connection and the student's Practice record."}
        </p>
      )}
      <div className="heatmap-rows">
        {heatmap.rows.map((row) => {
          const selected = row.cells.find((cell) => cell.catalogId === selectedId) ?? null;
          return (
            <div className="heatmap-row" key={row.topic}>
              <div className="heatmap-row-heading">
                <strong title={row.topic}>{topicShort(row.topic)}</strong>
                <span>Exam {formatExamWeight(row.topic)} · {row.practisedModules}/{row.cells.length} practised{row.accuracy !== null ? ` · ${row.accuracy}%` : ""}</span>
              </div>
              <div className="heatmap-cells" role="group" aria-label={`${row.topic} modules`}>
                {row.cells.map((cell) => (
                  <button
                    key={cell.catalogId}
                    type="button"
                    className={cx("heatmap-cell", `is-${cell.state}`, cell.stale && "is-stale", cell.taught && "is-taught", cell.catalogId === selectedId && "is-selected")}
                    aria-label={cellDescription(cell)}
                    aria-pressed={cell.catalogId === selectedId}
                    onClick={() => setSelectedId((current) => (current === cell.catalogId ? null : cell.catalogId))}
                  >
                    <span>{cell.label.slice(1)}</span>
                    {cell.accuracy !== null && <small>{cell.accuracy}</small>}
                  </button>
                ))}
              </div>
              {selected && (
                <div className="heatmap-detail" aria-live="polite">
                  <div>
                    <p className="eyebrow">{selected.label} · {STATE_LABEL[selected.state]}{selected.taught ? " · Taught" : ""}</p>
                    <strong>{selected.title}</strong>
                    <span>
                      {selected.questionCount
                        ? `${selected.questionCount} questions · ${selected.accuracy === null ? "not attempted yet" : `${selected.accuracy}% over ${selected.attempted} attempts`}${selected.due ? ` · ${selected.due} due for review` : ""}${selected.lastAttemptedAt ? ` · last practised ${formatDate(selected.lastAttemptedAt.slice(0, 10), { day: "numeric", month: "short" })}` : ""}`
                        : "No practice questions are published for this module yet."}
                    </span>
                  </div>
                  <div className="heatmap-detail-actions">
                    {role === "student" && selected.practiceModuleIds.length > 0 && (
                      <button className="button button-primary" type="button" onClick={() => onPracticeModule(selected.practiceModuleIds[0])}>
                        Practise this module <ArrowRight size={16} />
                      </button>
                    )}
                    <button className="icon-button" type="button" aria-label="Close module details" onClick={() => setSelectedId(null)}><X size={16} /></button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
      {heatmap.unmatched.length > 0 && (
        <details className="heatmap-unmatched">
          <summary>{heatmap.unmatched.length} practice {heatmap.unmatched.length === 1 ? "module is" : "modules are"} not linked to a curriculum module</summary>
          <ul>
            {heatmap.unmatched.map((module) => (
              <li key={module.moduleId}><strong>{module.moduleId}</strong> · {module.accuracy === null ? "not attempted" : `${module.accuracy}%`} · {module.questionCount} questions</li>
            ))}
          </ul>
        </details>
      )}
      <p className="fine-print">Exam weights are the 2027 Level I topic ranges. Coaching indicator only—not a pass prediction.</p>
    </section>
  );
}

export function ProgressView({
  section,
  onSection,
  tracker,
  updateTracker,
  notify,
  role,
  uid,
  canEditMastery,
  canManageMocks,
  onPracticeModule,
}: {
  section: ProgressSection;
  onSection: (section: ProgressSection) => void;
  tracker: TrackerState;
  updateTracker: UpdateTracker;
  notify: Notify;
  role: "tutor" | "student";
  uid: string;
  canEditMastery: boolean;
  canManageMocks: boolean;
  onPracticeModule: (moduleId: string) => void;
}) {
  return (
    <div className="view-stack progress-view">
      <SectionTabs label="Progress sections" idPrefix="progress" items={SECTIONS} active={section} onSelect={onSection} />
      <SectionPanel idPrefix="progress" active={section}>
        {section === "topics" && (
          <div className="view-stack">
            <ModuleHeatmapPanel tracker={tracker} role={role} uid={uid} onPracticeModule={onPracticeModule} />
            <MasteryView tracker={tracker} updateTracker={updateTracker} canEdit={canEditMastery} />
          </div>
        )}
        {section === "mocks" && (
          <MockView
            tracker={tracker}
            updateTracker={updateTracker}
            notify={notify}
            canManage={canManageMocks}
            moduleMockScores={<Suspense fallback={null}><ModuleMockScores uid={uid} role={role} /></Suspense>}
          />
        )}
      </SectionPanel>
    </div>
  );
}
