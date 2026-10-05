import {
  BadgeDollarSign, BellRing, CircleCheckBig, ClipboardCheck, Clock3, EyeOff, FilePenLine, Inbox, LibraryBig, PlayCircle, ShieldAlert, TrendingDown,
} from "lucide-react";
import { consoleAnchor } from "../../lib/tutorConsole";
import type { InboxItem, InboxKind } from "../../lib/tutorInbox";
import "./tutorConsole.css";
import { Fold } from "./Fold";

const KIND_ICON: Record<InboxKind, typeof Inbox> = {
  live: PlayCircle,
  approval: CircleCheckBig,
  grade: ClipboardCheck,
  overdue: Clock3,
  release: ClipboardCheck,
  payment: BadgeDollarSign,
  weak: TrendingDown,
  reminder: BellRing,
  incidents: ShieldAlert,
  draft: FilePenLine,
  "practice-gap": LibraryBig,
};

/** Everything waiting on the tutor, most urgent first, each with the action that resolves it. */
export function TutorInbox({
  items,
  hiddenCount,
  loading,
  busyId,
  onAction,
  onSnooze,
  onShowHidden,
}: {
  items: readonly InboxItem[];
  hiddenCount: number;
  loading: boolean;
  busyId: string | null;
  onAction: (item: InboxItem) => void;
  onSnooze: (item: InboxItem, mode: "day" | "changed") => void;
  onShowHidden: () => void;
}) {
  return (
    <Fold
      id="overview:inbox"
      anchorId={consoleAnchor.inbox}
      className="coach-inbox"
      eyebrow="Action inbox"
      title={loading ? "Checking…" : items.length ? `${items.length} waiting on you` : "Nothing waiting on you"}
      icon={<Inbox size={21} aria-hidden="true" />}
      summary={items[0] ? `Top: ${items[0].title}` : undefined}
    >
      {items.length > 0 && (
        <ul className="coach-inbox__list">
          {items.map((item) => {
            const Icon = KIND_ICON[item.kind];
            return (
              <li key={item.id} className={`coach-inbox__item is-${item.kind}`}>
                <Icon size={18} aria-hidden="true" />
                <div className="coach-inbox__text"><strong>{item.title}</strong><small>{item.detail}</small></div>
                <div className="coach-inbox__actions">
                  <button type="button" className="button button-primary" disabled={busyId !== null} onClick={() => onAction(item)}>
                    {busyId === item.id ? "Working…" : item.actionLabel}
                  </button>
                  <button type="button" className="coach-inbox__snooze" disabled={busyId !== null} aria-label={`Hide "${item.title}" for a day`} title="Hide for a day" onClick={() => onSnooze(item, "day")}>
                    <Clock3 size={15} aria-hidden="true" /> 1 day
                  </button>
                  <button type="button" className="coach-inbox__snooze" disabled={busyId !== null} aria-label={`Hide "${item.title}" until it changes`} title="Hide until it changes" onClick={() => onSnooze(item, "changed")}>
                    <EyeOff size={15} aria-hidden="true" /> Until it changes
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {hiddenCount > 0 && (
        <button type="button" className="coach-tile__action" onClick={onShowHidden}>Show {hiddenCount} hidden</button>
      )}
    </Fold>
  );
}
