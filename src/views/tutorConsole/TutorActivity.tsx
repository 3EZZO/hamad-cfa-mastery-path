import { History } from "lucide-react";
import { useState } from "react";
import { activityDayLabel, filterActivity, type ActivityEvent, type ActivityKind, type ActivityRange } from "../../lib/tutorActivity";
import { EmptyState } from "../shared";
import "./tutorConsole.css";
import { Fold } from "./Fold";

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
    <Fold
      id="activity:feed"
      className="coach-activity"
      eyebrow="Activity"
      title="What happened"
      icon={<History size={21} aria-hidden="true" />}
      summary={`${visible.length} ${visible.length === 1 ? "event" : "events"} in this period`}
    >
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
            <Fold key={group.label} id={`activity:day-${group.label}`} variant="sub" title={group.label} summary={`${group.events.length} ${group.events.length === 1 ? "event" : "events"}`}>
              <ol>
                {group.events.map((event) => (
                  <li key={event.id} className={`is-${event.kind}`}>
                    <time dateTime={new Date(event.atMs).toISOString()}>{event.dateOnly ? "" : new Date(event.atMs).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}</time>
                    <div><strong>{event.title}</strong>{event.detail && <small>{event.detail}</small>}</div>
                  </li>
                ))}
              </ol>
            </Fold>
          ))}
        </div>
      )}
      {visible.length > shown && (
        <button type="button" className="coach-tile__action" onClick={() => setShown((value) => value + PAGE)}>Show more ({visible.length - shown} left)</button>
      )}
    </Fold>
  );
}
