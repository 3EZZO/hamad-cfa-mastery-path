import { History } from "lucide-react";
import { useState } from "react";
import { activityDayLabel, filterActivity, type ActivityEvent, type ActivityKind, type ActivityRange } from "../../lib/tutorActivity";
import { EmptyState } from "../shared";
import "./tutorConsole.css";

const KINDS: ReadonlyArray<{ id: ActivityKind; label: string }> = [
  { id: "test", label: "Tests" },
  { id: "practice", label: "Practice" },
  { id: "session", label: "Sessions" },
  { id: "reminder", label: "Reminders" },
  { id: "mistake", label: "Mistakes" },
  { id: "payment", label: "Payments" },
];

const RANGES: ReadonlyArray<{ id: ActivityRange; label: string }> = [
  { id: "7", label: "7 days" },
  { id: "30", label: "30 days" },
  { id: "all", label: "All" },
];

const PAGE = 60;

/** A dated feed of what happened, newest first, filtered by kind and period. */
export function TutorActivity({ events, nowMs, loading }: { events: readonly ActivityEvent[]; nowMs: number; loading: boolean }) {
  const [kinds, setKinds] = useState<ReadonlySet<ActivityKind>>(() => new Set(KINDS.map((kind) => kind.id)));
  const [range, setRange] = useState<ActivityRange>("30");
  const [shown, setShown] = useState(PAGE);
  const visible = filterActivity(events, kinds, range, nowMs);
  const toggle = (kind: ActivityKind) => {
    setShown(PAGE);
    setKinds((current) => {
      const next = new Set(current);
      if (next.has(kind)) next.delete(kind); else next.add(kind);
      return next;
    });
  };

  const groups: Array<{ label: string; events: ActivityEvent[] }> = [];
  for (const event of visible.slice(0, shown)) {
    const label = activityDayLabel(event.atMs, nowMs);
    const last = groups.at(-1);
    if (last && last.label === label) last.events.push(event);
    else groups.push({ label, events: [event] });
  }

  return (
    <section className="panel coach-activity" aria-labelledby="coach-activity-title">
      <div className="panel-heading"><div><p className="eyebrow">Activity</p><h3 id="coach-activity-title">What happened</h3></div><History size={21} aria-hidden="true" /></div>
      <div className="coach-activity__filters">
        <div role="group" aria-label="Show">
          {KINDS.map((kind) => (
            <button type="button" key={kind.id} className="coach-chip" aria-pressed={kinds.has(kind.id)} onClick={() => toggle(kind.id)}>{kind.label}</button>
          ))}
        </div>
        <div role="group" aria-label="Period">
          {RANGES.map((option) => (
            <button type="button" key={option.id} className="coach-chip" aria-pressed={range === option.id} onClick={() => { setRange(option.id); setShown(PAGE); }}>{option.label}</button>
          ))}
        </div>
      </div>
      {loading ? <p className="fine-print">Loading…</p> : groups.length === 0 ? (
        <EmptyState icon={History} title="Nothing in this period">Change the filters or the period to see more.</EmptyState>
      ) : (
        <div className="coach-activity__days">
          {groups.map((group) => (
            <section key={group.label} aria-label={group.label}>
              <h4>{group.label}</h4>
              <ol>
                {group.events.map((event) => (
                  <li key={event.id} className={`is-${event.kind}`}>
                    <time dateTime={new Date(event.atMs).toISOString()}>{event.dateOnly ? "" : new Date(event.atMs).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}</time>
                    <div><strong>{event.title}</strong>{event.detail && <small>{event.detail}</small>}</div>
                  </li>
                ))}
              </ol>
            </section>
          ))}
        </div>
      )}
      {visible.length > shown && (
        <button type="button" className="coach-tile__action" onClick={() => setShown((value) => value + PAGE)}>Show more ({visible.length - shown} left)</button>
      )}
    </section>
  );
}
