import { BellRing, CalendarClock, CircleCheckBig, Clock3, PlayCircle } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MOCK_MODULES, mockModuleById } from "../../data/mockModules";
import { acknowledgeMockReminder, markMockReminderSeen, subscribeToMyMockReminders } from "../../lib/cloudMockReminders";
import { getMockAttempt, getMockTestMeta } from "../../lib/cloudMockTests";
import {
  deadlineCountdown,
  deadlineUrgent,
  formatReminderDate,
  pickReminderToShow,
  type MockReminder,
} from "../../lib/mockReminders";
import { useShellBusy } from "../../lib/shellBusy";
import { useDialogFocus } from "../liveSession/useDialogFocus";
import "./moduleMock.css";

interface ModuleProgress {
  id: string;
  pending: boolean;
  inProgress: boolean;
}

/** Re-check the clock so the once-a-day repeat and the countdown stay current. */
const CLOCK_TICK_MS = 60_000;

async function loadProgress(uid: string, moduleIds: readonly string[]): Promise<ModuleProgress[]> {
  return Promise.all(moduleIds.map(async (id): Promise<ModuleProgress> => {
    try {
      const meta = await getMockTestMeta(id);
      if (!meta || meta.status !== "published") return { id, pending: false, inProgress: false };
      const attempt = await getMockAttempt(uid, id);
      const inProgress = attempt?.status === "active";
      return { id, pending: !attempt || inProgress, inProgress };
    } catch {
      // Unknown state: do not nag about a module we cannot confirm.
      return { id, pending: false, inProgress: false };
    }
  }));
}

/**
 * Student side of the tutor's mock-test reminders. Listens for active
 * reminders, works out which listed modules are still pending, and opens a
 * window that only "Got it" (or going to a test) closes. Never opens while a
 * timed mock test, a practice run or a live session is on screen.
 */
export default function MockReminderHost({
  uid,
  onOpenModule,
}: {
  uid: string;
  onOpenModule: (moduleId: string) => void;
}) {
  const busy = useShellBusy();
  const [reminders, setReminders] = useState<MockReminder[]>([]);
  const [progress, setProgress] = useState<ModuleProgress[] | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  // Acknowledged on this device; closes the window at once, even offline.
  const [localAck, setLocalAck] = useState<Record<string, number>>({});
  const seenSent = useRef(new Set<string>());

  useEffect(() => subscribeToMyMockReminders(uid, setReminders, () => setReminders([])), [uid]);

  const moduleIds = useMemo(
    () => [...new Set(reminders.flatMap(reminder => reminder.moduleIds))].sort(),
    [reminders],
  );
  const moduleKey = moduleIds.join(",");

  const refreshProgress = useCallback(() => {
    if (!moduleIds.length) {
      setProgress([]);
      return;
    }
    void loadProgress(uid, moduleIds).then(setProgress);
    // moduleKey stands for moduleIds' contents.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid, moduleKey]);

  // Reload after a test finishes (busy clears) and whenever the reminders change.
  useEffect(() => { if (busy === null) refreshProgress(); }, [busy, refreshProgress]);

  useEffect(() => {
    const tick = () => setNowMs(Date.now());
    const timer = setInterval(tick, CLOCK_TICK_MS);
    if (typeof document === "undefined") return () => clearInterval(timer);
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      tick();
      refreshProgress();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refreshProgress]);

  const pendingIds = useMemo(() => (progress ?? []).filter(item => item.pending).map(item => item.id), [progress]);
  const effective = useMemo(
    () => reminders.map(reminder => {
      const local = localAck[reminder.id];
      return local && (reminder.acknowledgedAtMs ?? 0) < local ? { ...reminder, acknowledgedAtMs: local } : reminder;
    }),
    [reminders, localAck],
  );
  const shown = progress === null || busy !== null ? null : pickReminderToShow(effective, pendingIds, nowMs);

  useEffect(() => {
    if (!shown || shown.seenAtMs !== null || seenSent.current.has(shown.id)) return;
    seenSent.current.add(shown.id);
    void markMockReminderSeen(shown.id).catch(() => seenSent.current.delete(shown.id));
  }, [shown]);

  const acknowledge = useCallback((reminder: MockReminder) => {
    setLocalAck(current => ({ ...current, [reminder.id]: Date.now() }));
    // If this fails (offline), the window simply returns on the next launch.
    void acknowledgeMockReminder(reminder.id).catch(() => undefined);
  }, []);

  if (!shown) return null;
  return (
    <ReminderWindow
      reminder={shown}
      pending={(progress ?? []).filter(item => item.pending && shown.moduleIds.includes(item.id))}
      nowMs={nowMs}
      onAcknowledge={() => acknowledge(shown)}
      onOpenModule={moduleId => {
        acknowledge(shown);
        onOpenModule(moduleId);
      }}
    />
  );
}

export function ReminderWindow({
  reminder,
  pending,
  nowMs,
  onAcknowledge,
  onOpenModule,
}: {
  reminder: MockReminder;
  pending: ModuleProgress[];
  nowMs: number;
  onAcknowledge: () => void;
  onOpenModule: (moduleId: string) => void;
}) {
  const cardRef = useRef<HTMLElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  // Only "Got it" closes the window, so Escape is deliberately a no-op.
  useDialogFocus(true, cardRef, headingRef, () => undefined);
  const urgent = deadlineUrgent(reminder.deadline, nowMs);
  const ordered = [...pending].sort(
    (a, b) => (mockModuleById(a.id)?.number ?? 99) - (mockModuleById(b.id)?.number ?? 99),
  );

  return (
    // A click on the backdrop neither closes the window nor pulls focus out of it.
    <div className="mock-reminder" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) event.preventDefault(); }}>
      <section
        ref={cardRef}
        className={`mock-reminder__card${urgent ? " is-urgent" : ""}`}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="mock-reminder-title"
        aria-describedby="mock-reminder-message"
        tabIndex={-1}
      >
        <header className="mock-reminder__head">
          <span className="mock-reminder__icon" aria-hidden="true"><BellRing size={20} /></span>
          <div>
            <p className="mock-reminder__eyebrow">Message from your tutor</p>
            <h2 id="mock-reminder-title" ref={headingRef} tabIndex={-1}>Module mock tests reminder</h2>
          </div>
        </header>

        <p id="mock-reminder-message" className="mock-reminder__message">{reminder.message}</p>

        {reminder.deadline && (
          <div className="mock-reminder__deadline">
            <CalendarClock size={20} aria-hidden="true" />
            <div>
              <span>Deadline</span>
              <strong>{formatReminderDate(reminder.deadline)}</strong>
            </div>
            <em>{deadlineCountdown(reminder.deadline, nowMs)}</em>
          </div>
        )}

        <h3 className="mock-reminder__subhead">
          Still to complete <span>{ordered.length} of {reminder.moduleIds.length}</span>
        </h3>
        <ul className="mock-reminder__modules">
          {ordered.map(item => {
            const module = mockModuleById(item.id) ?? MOCK_MODULES.find(entry => entry.id === item.id);
            return (
              <li key={item.id}>
                <span className="mock-reminder__number" aria-hidden="true">{String(module?.number ?? "").padStart(2, "0")}</span>
                <div>
                  <strong>{module ? `Module ${module.number}` : item.id}</strong>
                  <small>{module?.title}{item.inProgress && <> · <Clock3 size={12} aria-hidden="true" /> in progress</>}</small>
                </div>
                <button type="button" className="mock-button mock-button--ghost" onClick={() => onOpenModule(item.id)}>
                  <PlayCircle size={16} />{item.inProgress ? "Return" : "Open"}
                  <span className="visually-hidden"> Module {module?.number} mock test</span>
                </button>
              </li>
            );
          })}
        </ul>

        <div className="mock-reminder__actions">
          <button type="button" className="mock-button mock-button--primary" onClick={onAcknowledge}>
            <CircleCheckBig size={17} />Got it
          </button>
        </div>
      </section>
    </div>
  );
}
