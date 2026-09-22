// Moved out of App.tsx unchanged (P3.9 split); see git history for origin.
import { ShieldCheck } from "lucide-react";
import { useMemo } from "react";
import { TOPICS } from "../data/plan";
import type { TrackerState } from "../types";
import { average, cx, masteryBand } from "./shared";
import type { UpdateTracker } from "./shared";

export function MasteryView({ tracker, updateTracker, canEdit }: { tracker: TrackerState; updateTracker: UpdateTracker; canEdit: boolean }) {
  const masteryAverage = Math.round(average(TOPICS.map((topic) => tracker.topicMastery[topic] ?? 0)));
  const readyTopics = TOPICS.filter((topic) => (tracker.topicMastery[topic] ?? 0) >= 80).length;

  const practiceByTopic = useMemo(() => {
    return Object.fromEntries(
      TOPICS.map((topic) => {
        const logs = tracker.practiceLogs.filter((log) => log.topic === topic);
        const attempted = logs.reduce((sum, log) => sum + log.attempted, 0);
        const correct = logs.reduce((sum, log) => sum + log.correct, 0);
        return [topic, { attempted, accuracy: attempted ? Math.round((correct / attempted) * 100) : 0 }];
      }),
    );
  }, [tracker.practiceLogs]);

  return (
    <div className="view-stack">
      <section className="mastery-overview panel">
        <div><p className="eyebrow">Ten-topic portfolio</p><h2>{masteryAverage || 0}% average mastery</h2><p>Set these levels from recent, timed, reviewed evidence. Confidence alone is not evidence.</p></div>
        <div className="mastery-total"><strong>{readyTopics}</strong><span>topics at 80%+</span></div>
      </section>
      {!canEdit && <div className="disclaimer-card"><ShieldCheck size={19} /><p><strong>Evidence review.</strong> Mohamed updates the mastery levels from reviewed practice, session, and mock evidence.</p></div>}
      <section className="mastery-grid">
        {TOPICS.map((topic, index) => {
          const score = tracker.topicMastery[topic] ?? 0;
          const band = masteryBand(score);
          const evidence = practiceByTopic[topic]!;
          return (
            <article className="mastery-card" key={topic}>
              <div className="mastery-card-top"><span className="topic-index">{String(index + 1).padStart(2, "0")}</span><span className={cx("status-badge", `status-${band.tone}`)}>{band.label}</span></div>
              <h3>{topic}</h3>
              <div className="mastery-score"><strong>{score}%</strong><span>{evidence.attempted ? `${evidence.accuracy}% across ${evidence.attempted} logged questions` : "No practice linked yet"}</span></div>
              <input
                className="mastery-slider"
                aria-label={`${topic} mastery`}
                type="range"
                disabled={!canEdit}
                min="0"
                max="100"
                step="1"
                value={score}
                style={{ "--slider-fill": `${score}%` } as React.CSSProperties}
                onChange={(event) => {
                  const value = Number(event.target.value);
                  updateTracker((current) => ({ ...current, topicMastery: { ...current.topicMastery, [topic]: value } }));
                }}
              />
              <div className="slider-labels"><span>Repair</span><span>Building</span><span>Ready</span></div>
            </article>
          );
        })}
      </section>
    </div>
  );
}
