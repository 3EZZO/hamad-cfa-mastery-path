// Moved out of App.tsx unchanged (P3.9 split); see git history for origin.
import { BookOpenCheck, Check, ChevronRight, CircleAlert, CircleCheckBig, Cloud, WifiOff } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { getWeekSessions, PLAN } from "../data/plan";
import program from "../data/program.json";
import { resolveReadingIds } from "../data/readings";
import { formatDate } from "../lib/dates";
import { getTaskStatus, isTaskComplete } from "../lib/taskStatus";
import type { TrackerSyncStatus } from "../hooks/useTrackerSync";
import type { PlanTask, PlanSession, PlanWeek, TrackerState } from "../types";
import { TAB_COPY } from "../lib/navigation";
import type { TabId } from "../lib/navigation";

export type UpdateTracker = (
  recipe: (current: TrackerState) => TrackerState,
) => void;


export type Notify = (message: string, tone?: "success" | "warning") => void;


export const ERROR_CATEGORIES = [
  "Concept gap",
  "Formula / process",
  "Reading error",
  "Time pressure",
  "Guessing discipline",
  "Confidence error",
];


export const NOTE_CATEGORIES = [
  "Shared tutor note",
  "Weekly reflection",
  "Commitment",
  "Resource link",
  "Exam logistics",
];


export const PLANNED_SESSIONS = PLAN.flatMap((week) =>
  getWeekSessions(week).map((session) => ({
    week,
    session,
  })),
);

export const CHECKPOINT_TIME = program.tutoringRhythm.time;


export function cx(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}


export function makeId(prefix: string): string {
  const random =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}-${random}`;
}


export function clamp(value: number, min = 0, max = 100): number {
  return Math.min(max, Math.max(min, value));
}


export function average(values: number[]): number {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}


export function topicShort(topic: string): string {
  const labels: Record<string, string> = {
    "Ethical and Professional Standards": "Ethics",
    "Quantitative Methods": "Quant",
    Economics: "Economics",
    "Financial Statement Analysis": "FSA",
    "Corporate Issuers": "Corporate",
    "Equity Investments": "Equity",
    "Fixed Income": "Fixed Income",
    Derivatives: "Derivatives",
    "Alternative Investments": "Alternatives",
    "Portfolio Management": "Portfolio",
  };
  return labels[topic] ?? topic;
}


export function phaseShort(phase: string): string {
  return phase.replace(/^Phase \d+\s*(?:·|\|)\s*/, "");
}


export function humanizeTaskDetail(detail: string): string {
  return detail
    .split(" | ")
    .map((part) =>
      /^\d{4}-\d{2}-\d{2}$/.test(part)
        ? formatDate(part, { day: "numeric", month: "short" })
        : part,
    )
    .join(" · ");
}


export function sortByDateDesc<T extends { date: string }>(entries: T[]): T[] {
  return [...entries].sort((a, b) => b.date.localeCompare(a.date));
}


export function masteryBand(score: number): { label: string; tone: string } {
  if (score >= 80) return { label: "Ready", tone: "positive" };
  if (score >= 65) return { label: "Building", tone: "gold" };
  if (score > 0) return { label: "Repair", tone: "danger" };
  return { label: "Unrated", tone: "muted" };
}


export function ProgressBar({ value, tone = "gold" }: { value: number; tone?: string }) {
  return (
    <div className="progress-track" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={clamp(value)} aria-label={`${Math.round(clamp(value))} percent`}>
      <span
        className={cx("progress-fill", `progress-${tone}`)}
        style={{ width: `${clamp(value)}%` }}
      />
    </div>
  );
}


export function EmptyState({
  icon: Icon,
  title,
  children,
}: {
  icon: LucideIcon;
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="empty-state">
      <span className="empty-icon"><Icon size={22} /></span>
      <strong>{title}</strong>
      <p>{children}</p>
    </div>
  );
}


export function PageHeading({ tab }: { tab: TabId }) {
  const copy = TAB_COPY[tab];
  return (
    <header className="page-heading">
      <p className="eyebrow">{copy.eyebrow}</p>
      <h1>{copy.title}</h1>
      <p>{copy.description}</p>
    </header>
  );
}


export function TaskChecklist({
  tasks,
  tracker,
  role,
  onToggle,
  compact = false,
}: {
  tasks: PlanTask[];
  tracker: TrackerState;
  role: "tutor" | "student";
  onToggle: (id: string) => void;
  compact?: boolean;
}) {
  return (
    <div className={cx("task-list", compact && "task-list-compact")}>
      {tasks.map((task) => {
        const status = getTaskStatus(task, tracker);
        const complete = isTaskComplete(task, tracker);
        const statusCopy = task.kind === "session"
          ? status === "approved"
            ? "Tutor approved"
            : status === "requested"
              ? "Awaiting tutor approval"
              : status === "returned"
                ? "Returned for follow-up"
                : role === "student"
                  ? "Request tutor approval"
                  : "Awaiting student request"
          : complete ? "Complete" : "Mark complete";
        return (
          <label className={cx("task-row", complete && "is-complete")} key={task.id}>
            <input
              type="checkbox"
              checked={complete}
              onChange={() => onToggle(task.id)}
            />
            <span className="task-check" aria-hidden="true">
              {complete && <Check size={14} strokeWidth={3} />}
            </span>
            <span className="task-copy">
              <span className="task-label">{task.label}</span>
              <span className="task-detail">
                {humanizeTaskDetail(task.detail)}
                {task.optional && <em>Optional</em>}
                <em className={`task-status task-status-${status}`}>{statusCopy}</em>
              </span>
            </span>
          </label>
        );
      })}
    </div>
  );
}


export function ReadingCoverage({
  session,
}: {
  week: PlanWeek;
  session: PlanSession;
}) {
  const readings = resolveReadingIds(session.readings);

  if (readings.length) {
    return (
      <details className="reading-coverage">
        <summary>
          <span><BookOpenCheck size={14} /> {readings.length} assigned {readings.length === 1 ? "module" : "modules"}</span>
          <ChevronRight size={15} />
        </summary>
        <ul>
          {readings.map((reading) => (
            <li key={reading.id}>
              <strong>{reading.title}</strong>
              <small>Official 2027 curriculum module</small>
            </li>
          ))}
        </ul>
      </details>
    );
  }

  return (
    <div className="reading-pending reading-no-new">
      <BookOpenCheck size={14} />
      <span>
        {session.number <= 3
          ? "No assigned module — teaching, calculator, or learning-system session"
          : "No new module — integration, mock, repair, or taper session"}
      </span>
    </div>
  );
}


export function syncPresentation(status: TrackerSyncStatus): {
  label: string;
  detail: string;
  tone: string;
  icon: LucideIcon;
} {
  switch (status) {
    case "synced":
      return {
        label: "Synced",
        detail: "Progress is current on every signed-in device.",
        tone: "is-synced",
        icon: CircleCheckBig,
      };
    case "saving":
      return {
        label: "Saving...",
        detail: "Your latest change is being uploaded.",
        tone: "is-saving",
        icon: Cloud,
      };
    case "offline":
      return {
        label: "Offline - changes queued",
        detail: "This device will sync automatically when it reconnects.",
        tone: "is-offline",
        icon: WifiOff,
      };
    case "error":
      return {
        label: "Sync needs attention",
        detail: "Your work is safe on this device. Try syncing again.",
        tone: "is-error",
        icon: CircleAlert,
      };
    case "loading":
    default:
      return {
        label: "Connecting...",
        detail: "Loading the latest shared progress.",
        tone: "is-loading",
        icon: Cloud,
      };
  }
}


export function MetricCard({
  icon: Icon,
  label,
  value,
  detail,
  progress,
  loading,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  detail: string;
  progress: number;
  loading?: boolean;
}) {
  const [displayProgress, setDisplayProgress] = useState(0);

  useEffect(() => {
    let animationFrameId: number;
    const duration = 600;
    const startTime = performance.now();

    const animate = (time: number) => {
      const elapsed = time - startTime;
      const t = Math.min(elapsed / duration, 1);
      // ease-out curve
      const easeOut = 1 - Math.pow(1 - t, 3);

      const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
      if (mediaQuery.matches) {
        setDisplayProgress(progress);
      } else {
        setDisplayProgress(progress * easeOut);
        if (t < 1) {
          animationFrameId = requestAnimationFrame(animate);
        }
      }
    };

    animationFrameId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animationFrameId);
  }, [progress]);

  const radius = 22;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (displayProgress / 100) * circumference;

  const displayValue = value === "—" ? "—" : `${Math.round(displayProgress)}%`;

  if (loading) {
    return (
      <article className="metric-card skeleton-loading">
        <div className="metric-top"><span className="skeleton-text short"></span></div>
        <div className="metric-gauge-layout">
          <div className="skeleton-circle"></div>
          <div className="metric-score">
            <span className="skeleton-text"></span>
            <span className="skeleton-text long"></span>
          </div>
        </div>
      </article>
    );
  }

  if (value === "—") {
    return (
      <article className="metric-card empty-metric-state">
        <div className="metric-top"><span>{label}</span><Icon size={18} /></div>
        <div className="empty-metric-content">
          <Icon size={24} className="empty-metric-icon" />
          <p>Log your first attempt to see this</p>
        </div>
      </article>
    );
  }

  return (
    <article className="metric-card">
      <div className="metric-top"><span>{label}</span><Icon size={18} /></div>
      <div className="metric-gauge-layout">
        <div className="metric-gauge">
          <svg viewBox="0 0 52 52" width="52" height="52">
            <circle cx="26" cy="26" r={radius} fill="none" stroke="var(--border)" strokeWidth="6" />
            <circle
              cx="26" cy="26" r={radius} fill="none" stroke="var(--theme-blue)" strokeWidth="6"
              strokeDasharray={circumference}
              strokeDashoffset={strokeDashoffset}
              strokeLinecap="round"
              transform="rotate(-90 26 26)"
            />
          </svg>
        </div>
        <div className="metric-stats">
          <strong>{displayValue}</strong>
          <p>{detail}</p>
        </div>
      </div>
    </article>
  );
}


export function EvidenceRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="evidence-row">
      <span>{label}</span>
      <ProgressBar value={value} />
      <strong>{value}%</strong>
    </div>
  );
}


export function MiniMetric({ label, value, icon: Icon }: { label: string; value: string; icon: LucideIcon }) {
  return (
    <article className="mini-metric"><span><Icon size={17} /></span><div><strong>{value}</strong><p>{label}</p></div></article>
  );
}
