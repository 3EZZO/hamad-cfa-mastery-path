import { useMemo } from "react";
import type { LiveSessionEvidence } from "./types";

export interface MasteryRadarProps {
  evidence: LiveSessionEvidence[];
  total: number;
}

export function MasteryRadar({ evidence, total }: MasteryRadarProps) {
  const summary = useMemo(() => {
    const latest = new Map<string, LiveSessionEvidence>();
    evidence.forEach(entry => latest.set(entry.targetId, entry));
    const values = [...latest.values()];
    return {
      recorded: values.length,
      correct: values.filter(entry => entry.verdict === "correct").length,
      partial: values.filter(entry => entry.verdict === "partial").length,
      repair: values.filter(entry => entry.verdict === "repair").length,
      parked: values.filter(entry => entry.verdict === "parked").length,
    };
  }, [evidence]);
  const safeTotal = Math.max(1, total);
  const circumference = 201.06;
  const dash = Math.min(circumference, (summary.recorded / safeTotal) * circumference);
  const label = `Proof Radar: ${summary.recorded} of ${total} mastery proofs recorded; ${summary.correct} secure, ${summary.partial} developing, ${summary.repair} repair, ${summary.parked} deferred.`;

  return (
    <div className="ls-mastery-radar" role="img" aria-label={label} title={label}>
      <svg viewBox="0 0 78 78" aria-hidden="true">
        <circle className="ls-mastery-radar__grid" cx="39" cy="39" r="32" />
        <circle className="ls-mastery-radar__grid is-inner" cx="39" cy="39" r="21" />
        <path className="ls-mastery-radar__axis" d="M39 7v64M7 39h64M16.4 16.4l45.2 45.2M61.6 16.4L16.4 61.6" />
        <circle
          className="ls-mastery-radar__progress"
          cx="39"
          cy="39"
          r="32"
          pathLength={circumference}
          strokeDasharray={`${dash} ${circumference}`}
        />
        <circle className="ls-mastery-radar__center" cx="39" cy="39" r="13" />
      </svg>
      <span className="ls-mastery-radar__score"><strong>{summary.recorded}</strong><small>/{total}</small></span>
      <span className="ls-mastery-radar__label">Proof Radar</span>
      <span className="ls-mastery-radar__dots" aria-hidden="true">
        <i className="is-correct" title={`${summary.correct} correct`} />
        <i className="is-partial" title={`${summary.partial} partial`} />
        <i className="is-repair" title={`${summary.repair} repair`} />
        <i className="is-parked" title={`${summary.parked} parked`} />
      </span>
    </div>
  );
}
