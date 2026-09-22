// Moved out of App.tsx unchanged (P3.9 split); see git history for origin.
import { CalendarClock, CalendarDays, Check, CircleAlert, CircleCheckBig, Cloud, RotateCcw, ShieldCheck, Trash2 } from "lucide-react";
import { type FormEvent, useState } from "react";
import { getPlanTasks, PLAN } from "../data/plan";
import program from "../data/program.json";
import { formatDate } from "../lib/dates";
import { createDefaultState, downloadBackup } from "../lib/storage";
import { isStateMeaningfullyEmpty } from "../lib/stateMerge";
import { getTaskStatus } from "../lib/taskStatus";
import { cascadeReschedule, getEffectiveSessions, restoreCanonicalSession } from "../lib/schedule";
import type { TrackerSyncStatus } from "../hooks/useTrackerSync";
import { useAppDialog } from "../components/AppDialog";
import { PracticeBankAdmin } from "../lazyViews";
import type { TrackerState } from "../types";
import { CHECKPOINT_TIME, EmptyState, PLANNED_SESSIONS, cx } from "./shared";
import type { Notify, UpdateTracker } from "./shared";

export function TutorAdminView({
  tracker,
  updateTracker,
  replaceTrackerAuthoritatively,
  authoritativeReplaceBusy,
  syncStatus,
  notify,
}: {
  tracker: TrackerState;
  updateTracker: UpdateTracker;
  replaceTrackerAuthoritatively: (state: TrackerState) => Promise<void>;
  authoritativeReplaceBusy: boolean;
  syncStatus: TrackerSyncStatus;
  notify: Notify;
}) {
  const dialog = useAppDialog();
  const effectiveSessions = getEffectiveSessions(tracker.sessionOverrides);
  const [selectedSession, setSelectedSession] = useState(1);
  const selected = effectiveSessions.find(
    (entry) => entry.session.number === selectedSession,
  ) ?? effectiveSessions[0]!;
  const [newDate, setNewDate] = useState(selected.effectiveDate);
  const [rescheduleReason, setRescheduleReason] = useState("");
  const hasProgress = !isStateMeaningfullyEmpty(tracker);
  const scheduleIntact =
    (effectiveSessions[0]?.effectiveDate ?? program.examAppointment) >=
      program.programStart &&
    (effectiveSessions.at(-1)?.effectiveDate ?? program.examAppointment) <
      program.examAppointment;
  const launchChecks = [
    {
      label: "Tutor role verified",
      detail: "This console is available only to the Firebase member with role tutor.",
      complete: true,
    },
    {
      label: "Live synchronization",
      detail: syncStatus === "synced" ? "Cloud progress is current." : "Wait for the Synced indicator before resetting or importing.",
      complete: syncStatus === "synced",
    },
    {
      label: "Schedule safety",
      detail: `${effectiveSessions.length} sessions; first ${effectiveSessions[0]?.effectiveDate}; final ${effectiveSessions.at(-1)?.effectiveDate}; exam ${program.examAppointment}.`,
      complete:
        effectiveSessions.length === program.tutoringRhythm.totalSessions &&
        scheduleIntact,
    },
    {
      label: "Shared progress state",
      detail: hasProgress ? "Existing evidence is present. Export before any reset." : "The shared tracker is clean for launch.",
      complete: !hasProgress,
    },
  ];
  const pendingSessionRequests = PLAN.flatMap((week) =>
    getPlanTasks(week, tracker.sessionOverrides)
      .filter((task) => task.kind === "session")
      .map((task) => ({ task, request: tracker.sessionCompletionRequests[task.id] }))
      .filter((entry) => entry.request && getTaskStatus(entry.task, tracker) === "requested"),
  );

  const reviewSessionRequest = async (
    taskId: string,
    status: "approved" | "returned",
  ) => {
    const note = status === "returned"
      ? await dialog.prompt("Optional follow-up note for Hamad:", "Please review the session action points.") ?? ""
      : "";
    if (!dialog.active()) return;
    updateTracker((current) => {
      const request = current.sessionCompletionRequests[taskId];
      if (!request) return current;
      return {
        ...current,
        sessionCompletionReviews: {
          ...current.sessionCompletionReviews,
          [taskId]: {
            taskId,
            requestedAt: request.requestedAt,
            status,
            reviewedAt: new Date().toISOString(),
            note,
          },
        },
      };
    });
    notify(status === "approved" ? "Session completion approved." : "Session request returned to Hamad.");
  };

  const chooseSession = (sessionNumber: number) => {
    const entry = effectiveSessions.find(
      (candidate) => candidate.session.number === sessionNumber,
    );
    setSelectedSession(sessionNumber);
    if (entry) setNewDate(entry.effectiveDate);
  };

  const submitReschedule = async (event: FormEvent) => {
    event.preventDefault();
    try {
      const result = cascadeReschedule(
        tracker.sessionOverrides,
        selectedSession,
        newDate,
        rescheduleReason,
      );
      const summary = `Move Session ${String(selectedSession).padStart(2, "0")} to ${newDate} at ${CHECKPOINT_TIME}?`;
      if (!await dialog.confirm(summary)) return;
      updateTracker((current) => ({
        ...current,
        sessionOverrides: cascadeReschedule(
          current.sessionOverrides,
          selectedSession,
          newDate,
          rescheduleReason,
        ).overrides,
      }));
      setRescheduleReason("");
      notify(
        result.changedSessionNumbers.length
          ? `Session ${String(selectedSession).padStart(2, "0")} rescheduled.`
          : "The selected checkpoint already uses that date.",
      );
    } catch (error) {
      notify(error instanceof Error ? error.message : "Unable to reschedule.", "warning");
    }
  };

  const restoreSchedule = async () => {
    if (!await dialog.confirm(`Restore Session ${String(selectedSession).padStart(2, "0")} to its canonical Saturday?`)) return;
    updateTracker((current) => ({
      ...current,
      sessionOverrides: restoreCanonicalSession(
        current.sessionOverrides,
        selectedSession,
      ),
    }));
    notify("Canonical session dates restored.");
  };

  const resetSharedProgress = async () => {
    const confirmation = await dialog.prompt(
      "A JSON backup will download first. To erase all shared progress on every device, type RESET HAMAD MASTERY",
    );
    if (!dialog.active()) return;
    if (confirmation !== "RESET HAMAD MASTERY") {
      notify("Reset cancelled. The confirmation text did not match.", "warning");
      return;
    }
    downloadBackup(tracker);
    try {
      await replaceTrackerAuthoritatively(createDefaultState());
      notify("Shared progress reset. The backup remains on this device.");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Reset failed.", "warning");
    }
  };

  return (
    <div className="view-stack tutor-console">
      <PracticeBankAdmin notify={notify} />
      <section className="panel approval-queue">
        <div className="panel-heading"><div><p className="eyebrow">Tutor approval</p><h3>Session completion queue</h3></div><CircleCheckBig size={21} /></div>
        {pendingSessionRequests.length ? <div className="entry-list">{pendingSessionRequests.map(({ task, request }) => <article className="approval-entry" key={task.id}><div><strong>{task.label}</strong><span>Requested {request ? new Date(request.requestedAt).toLocaleString() : ""}</span></div><div className="inline-actions"><button className="button button-primary" type="button" onClick={() => reviewSessionRequest(task.id, "approved")}><Check size={16} /> Approve</button><button className="button button-secondary" type="button" onClick={() => reviewSessionRequest(task.id, "returned")}><RotateCcw size={16} /> Return</button></div></article>)}</div> : <EmptyState icon={CircleCheckBig} title="No approvals waiting">Hamad's session-completion requests will appear here.</EmptyState>}
      </section>
      <details className="tracker-secondary-tools">
        <summary>
          <span>Schedule, readiness & recovery</span>
          <small>{Object.keys(tracker.sessionOverrides).length} changed dates · Tutor controls</small>
        </summary>
        <div className="tracker-secondary-tools__content">
      <section className="panel launch-control-panel">
        <div className="panel-heading"><div><p className="eyebrow">Pre-launch control</p><h3>Four live checks before the first session</h3></div><ShieldCheck size={21} /></div>
        <div className="launch-check-grid">
          {launchChecks.map((check) => (
            <article className={cx("launch-check", check.complete && "is-complete")} key={check.label}>
              {check.complete ? <CircleCheckBig size={18} /> : <CircleAlert size={18} />}
              <div><strong>{check.label}</strong><p>{check.detail}</p></div>
            </article>
          ))}
          <article className="launch-check launch-reminder">
            <CircleAlert size={18} />
            <div>
              <strong>Manual account reminder</strong>
              <p>Ask Hamad to replace the temporary Firebase password after his first successful login. Firebase does not expose password-change status to this tracker.</p>
            </div>
          </article>
        </div>
      </section>

      <section className="form-and-list tutor-tool-grid">
        <form className="panel entry-form" onSubmit={submitReschedule}>
          <div className="panel-heading"><div><p className="eyebrow">Safe rescheduling</p><h3>Use a same-week Friday exception</h3></div><CalendarClock size={21} /></div>
          <label><span>Session</span><select value={selectedSession} onChange={(event) => chooseSession(Number(event.target.value))}>{effectiveSessions.map((entry) => <option value={entry.session.number} key={entry.session.number}>S{String(entry.session.number).padStart(2, "0")} · {formatDate(entry.effectiveDate, { day: "numeric", month: "short" })} · {entry.session.title}</option>)}</select></label>
          <div className="form-grid form-grid-2">
            <label><span>New date</span><input type="date" min={program.programStart} max={PLANNED_SESSIONS.at(-1)!.session.date} required value={newDate} onChange={(event) => setNewDate(event.target.value)} /></label>
            <label><span>Current date</span><input type="text" readOnly value={formatDate(selected.effectiveDate)} /></label>
          </div>
          <label><span>Reason</span><textarea required rows={3} maxLength={300} placeholder="Short tutor-approved reason for the schedule record." value={rescheduleReason} onChange={(event) => setRescheduleReason(event.target.value)} /></label>
          <div className="inline-actions">
            <button className="button button-primary" type="submit"><CalendarClock size={16} /> Preview and apply</button>
            <button className="button button-secondary" type="button" onClick={restoreSchedule}><RotateCcw size={16} /> Restore S{String(selectedSession).padStart(2, "0")}</button>
          </div>
          <p className="fine-print">Each checkpoint stays on its planned Saturday unless Mohamed approves the immediately preceding Friday. The 09:00 Riyadh time, weekly sequence, and exam buffer remain fixed.</p>
        </form>

        <article className="panel override-panel">
          <div className="panel-heading"><div><p className="eyebrow">Live schedule record</p><h3>{Object.keys(tracker.sessionOverrides).length} changed dates</h3></div><CalendarDays size={21} /></div>
          {Object.keys(tracker.sessionOverrides).length ? (
            <div className="override-list">{effectiveSessions.filter((entry) => entry.rescheduled).map((entry) => <div key={entry.session.number}><strong>S{String(entry.session.number).padStart(2, "0")}</strong><span>{formatDate(entry.session.date, { day: "numeric", month: "short" })} → {formatDate(entry.effectiveDate, { day: "numeric", month: "short" })}</span><small>{entry.reason}</small></div>)}</div>
          ) : <EmptyState icon={CalendarDays} title="Canonical schedule active">No session date has been overridden.</EmptyState>}
        </article>
      </section>

      <section className="panel danger-zone">
        <div><p className="eyebrow">Protected recovery control</p><h3>Export, then reset all shared progress</h3><p>Use only before genuine course work begins. This creates a local JSON recovery copy before replacing the synchronized tracker on every device.</p></div>
        <button className="button button-danger" type="button" disabled={authoritativeReplaceBusy || syncStatus !== "synced"} onClick={() => void resetSharedProgress()}><Trash2 size={16} />{authoritativeReplaceBusy ? "Resetting..." : "Export and reset"}</button>
      </section>
        </div>
      </details>
    </div>
  );
}
