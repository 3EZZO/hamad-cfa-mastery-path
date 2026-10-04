// Tutor Admin: a tabbed control centre (`#coach/<section>`). The session,
// schedule and recovery tools moved here from App.tsx in the P3.9 split.
import { Archive, CalendarClock, CalendarDays, Check, CircleAlert, CircleCheckBig, ClipboardCheck, History, LayoutDashboard, LibraryBig, RotateCcw, ShieldCheck, Trash2 } from "lucide-react";
import { type FormEvent, Suspense, useEffect, useMemo, useState } from "react";
import { getPlanTasks, PLAN } from "../data/plan";
import program from "../data/program.json";
import { formatDate, getProgramWeek, todayDateOnly } from "../lib/dates";
import { MOCK_MODULES, mockModuleById, mockModuleCode } from "../data/mockModules";
import { useTutorConsole } from "../hooks/useTutorConsole";
import {
  TUTOR_SECTIONS,
  buildConsoleEntries,
  consoleAnchor,
  consoleGlance,
  sectionCounts,
  summarizePayments,
  type ConsoleEntry,
  type TutorSection,
} from "../lib/tutorConsole";
import { buildActivity } from "../lib/tutorActivity";
import { buildTutorInbox, isSnoozed, loadSnoozes, overdueModuleIds, saveSnoozes, type InboxItem, type InboxSnoozes } from "../lib/tutorInbox";
import { buildSessionPrep } from "../lib/sessionPrep";
import { moduleStandings, paceReport, suggestActions, type InsightSuggestion } from "../lib/tutorInsights";
import { weekCatalogIds } from "../lib/weekTests";
import { TutorActivity } from "./tutorConsole/TutorActivity";
import { TutorInbox } from "./tutorConsole/TutorInbox";
import { TutorInsights } from "./tutorConsole/TutorInsights";
import { SessionPrepPanel } from "./tutorConsole/SessionPrepPanel";
import { TutorOverview } from "./tutorConsole/TutorOverview";
import { TutorQuickFind } from "./tutorConsole/TutorQuickFind";
import { createDefaultState, downloadBackup } from "../lib/storage";
import { isStateMeaningfullyEmpty } from "../lib/stateMerge";
import { getTaskStatus } from "../lib/taskStatus";
import { cascadeReschedule, getEffectiveSessions, restoreCanonicalSession } from "../lib/schedule";
import type { TrackerSyncStatus } from "../hooks/useTrackerSync";
import { useAppDialog } from "../components/AppDialog";
import { TutorBriefPanel } from "../components/TutorBrief";
import { MockTestAdmin, PracticeBankAdmin } from "../lazyViews";
import type { TrackerState } from "../types";
import { CHECKPOINT_TIME, EmptyState, PLANNED_SESSIONS, SectionPanel, SectionTabs, cx } from "./shared";
import type { Notify, UpdateTracker } from "./shared";

const SECTION_ICON: Record<TutorSection, typeof LayoutDashboard> = {
  overview: LayoutDashboard,
  tests: ClipboardCheck,
  practice: LibraryBig,
  sessions: CalendarDays,
  activity: History,
  records: Archive,
};

/** Bring a row into view after its section renders (panels load their data asynchronously). */
function revealAnchor(anchor: string): () => void {
  if (typeof document === "undefined") return () => undefined;
  let tries = 0;
  const timer = window.setInterval(() => {
    const target = document.getElementById(anchor);
    tries += 1;
    if (target) {
      window.clearInterval(timer);
      target.scrollIntoView({ behavior: "smooth", block: "center" });
      target.classList.add("is-located");
      window.setTimeout(() => target.classList.remove("is-located"), 2400);
    } else if (tries > 30) {
      window.clearInterval(timer);
    }
  }, 100);
  return () => window.clearInterval(timer);
}

export function TutorAdminView({
  tracker,
  updateTracker,
  replaceTrackerAuthoritatively,
  authoritativeReplaceBusy,
  syncStatus,
  notify,
  section = "overview",
  onSection = () => undefined,
  onOpenPayments,
  onOpenSessionMode,
}: {
  tracker: TrackerState;
  updateTracker: UpdateTracker;
  replaceTrackerAuthoritatively: (state: TrackerState) => Promise<void>;
  authoritativeReplaceBusy: boolean;
  syncStatus: TrackerSyncStatus;
  notify: Notify;
  section?: TutorSection;
  onSection?: (section: TutorSection) => void;
  onOpenPayments?: () => void;
  onOpenSessionMode?: () => void;
}) {
  const dialog = useAppDialog();
  const consoleData = useTutorConsole();
  const [pendingAnchor, setPendingAnchor] = useState<string | null>(null);
  const [snoozes, setSnoozes] = useState<InboxSnoozes>(loadSnoozes);
  const [busyItem, setBusyItem] = useState<string | null>(null);
  useEffect(() => (pendingAnchor ? revealAnchor(pendingAnchor) : undefined), [pendingAnchor, section]);
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

  const glance = consoleGlance({
    metas: consoleData.metas,
    attempts: consoleData.attempts,
    reminders: consoleData.reminders,
    banks: consoleData.banks,
    assignedBankIds: consoleData.assignedBankIds,
    approvals: pendingSessionRequests.length,
  });
  const nowMs = new Date().getTime();
  const today = todayDateOnly();
  const nextSession = effectiveSessions.find((entry) => entry.effectiveDate >= today) ?? null;
  const sessionLabels = new Map(PLAN.flatMap((week) => getPlanTasks(week, tracker.sessionOverrides))
    .filter((task) => task.kind === "session").map((task) => [task.id, task.label] as const));
  const paymentSummary = consoleData.payments?.config
    ? summarizePayments(consoleData.payments.config, consoleData.payments.records, new Date(nowMs))
    : null;
  // Practice answers tied to their practice module, via the published banks.
  const questionModule = new Map((consoleData.banks ?? []).flatMap((bank) => bank.questions.map((question) => [question.id, question.moduleId] as const)));
  const practiceAnswers = (consoleData.runs ?? []).flatMap((run) => run.answers.flatMap((answer) => {
    const moduleId = questionModule.get(answer.questionId);
    const answeredAtMs = Date.parse(answer.answeredAt);
    return moduleId && Number.isFinite(answeredAtMs) ? [{ moduleId, answeredAtMs, correct: answer.correct }] : [];
  }));
  const inbox = consoleData.loading ? [] : buildTutorInbox({
    nowMs,
    approvals: pendingSessionRequests.map(({ task, request }) => ({ taskId: task.id, label: task.label, requestedAt: request!.requestedAt })),
    metas: consoleData.metas,
    attempts: consoleData.attempts,
    reminders: consoleData.reminders,
    studentUid: consoleData.studentUid,
    banks: consoleData.banks,
    assignedBankIds: consoleData.assignedBankIds,
    practiceAnswers,
    weekCatalogIds: weekCatalogIds(getProgramWeek()),
    payment: paymentSummary,
  });
  const visibleInbox = inbox.filter((item) => !isSnoozed(item, snoozes, nowMs));
  const publishedTestIds = new Set((consoleData.metas ?? []).filter((meta) => meta.status === "published").map((meta) => meta.moduleId));
  const standings = moduleStandings(consoleData.attempts ?? [], practiceAnswers);
  const pace = paceReport({
    week: getProgramWeek(new Date(nowMs)),
    nowMs,
    examDate: program.examAppointment,
    publishedTestIds,
    attempts: consoleData.attempts ?? [],
    answers: practiceAnswers,
  });
  const suggestions = suggestActions(pace, standings);
  const nextIndex = nextSession ? effectiveSessions.indexOf(nextSession) : -1;
  const prep = nextSession ? buildSessionPrep({
    session: { number: nextSession.session.number, date: nextSession.effectiveDate, title: nextSession.session.title, readings: nextSession.session.readings },
    since: nextIndex > 0 ? effectiveSessions[nextIndex - 1]!.effectiveDate : null,
    attempts: consoleData.attempts ?? [],
    answers: practiceAnswers,
    standings,
    overdueTestIds: overdueModuleIds({ nowMs, metas: consoleData.metas, attempts: consoleData.attempts, reminders: consoleData.reminders, studentUid: consoleData.studentUid }),
    publishedTestIds,
  }) : null;
  const counts = { ...sectionCounts(glance), overview: visibleInbox.length };
  const snooze = (item: InboxItem, mode: "day" | "changed") => {
    const next = { ...snoozes, [item.id]: mode === "day" ? { untilMs: nowMs + 24 * 60 * 60 * 1000 } : { version: item.version } };
    setSnoozes(next);
    saveSnoozes(next);
  };
  const showHidden = () => {
    const next = Object.fromEntries(Object.entries(snoozes).filter(([id]) => !inbox.some((item) => item.id === id)));
    setSnoozes(next);
    saveSnoozes(next);
  };
  const activity = section === "activity" ? buildActivity({
    attempts: consoleData.attempts ?? [],
    history: consoleData.history ?? [],
    runs: consoleData.runs ?? [],
    sessionRequests: Object.values(tracker.sessionCompletionRequests).map((request) => ({
      taskId: request.taskId, label: sessionLabels.get(request.taskId) ?? request.taskId, requestedAt: request.requestedAt,
    })),
    sessionReviews: Object.values(tracker.sessionCompletionReviews).map((review) => ({
      ...review, label: sessionLabels.get(review.taskId) ?? review.taskId,
    })),
    reminders: consoleData.reminders ?? [],
    mistakes: tracker.errorEntries,
    payments: consoleData.payments?.records ?? [],
    currency: consoleData.payments?.config?.currency ?? null,
  }) : [];
  const entries = useMemo<ConsoleEntry[]>(() => {
    const assigned = new Set(consoleData.assignedBankIds ?? []);
    return buildConsoleEntries({
      tests: MOCK_MODULES.map((module) => ({
        id: module.id,
        code: mockModuleCode(module),
        title: module.title,
        topic: module.topic,
        status: consoleData.metas?.find((meta) => meta.moduleId === module.id)?.status ?? null,
      })),
      banks: (consoleData.banks ?? []).map((bank) => ({
        storageId: bank.storageId, title: bank.title, topic: bank.topic, questions: bank.questions.length, unlocked: assigned.has(bank.storageId),
      })),
      sessions: effectiveSessions.map((entry) => ({
        number: entry.session.number,
        title: entry.session.title,
        dateLabel: formatDate(entry.effectiveDate, { day: "numeric", month: "short" }),
      })),
      reminders: (consoleData.reminders ?? []).filter((reminder) => reminder.status === "active").map((reminder) => ({
        id: reminder.id,
        codes: reminder.moduleIds.map((id) => { const module = mockModuleById(id); return module ? mockModuleCode(module) : id; }),
        deadline: reminder.deadline,
      })),
    });
  }, [consoleData.assignedBankIds, consoleData.banks, consoleData.metas, consoleData.reminders, effectiveSessions]);
  // After an action inside a section panel, the overview counts and badges catch up.
  const notifyAndRefresh: Notify = (message, tone) => { notify(message, tone); consoleData.refresh(); };

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

  const openSection = (target: TutorSection, anchor: string | null) => {
    onSection(target);
    if (anchor) setPendingAnchor(anchor);
  };

  const runSuggestion = (suggestion: InsightSuggestion) => {
    const { action } = suggestion;
    if (action.type === "remind") openSection("tests", consoleAnchor.reminders);
    else if (action.type === "open-test") openSection("tests", consoleAnchor.test(action.moduleId));
    else openSection("practice", null);
  };

  const copyAgenda = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      notify("Agenda copied.");
    } catch {
      notify("Copying is blocked here; select the agenda text instead.", "warning");
    }
  };

  const runInboxAction = async (item: InboxItem) => {
    const { action } = item;
    if (action.type === "open") return openSection(action.section, action.anchor);
    if (action.type === "open-payments") return onOpenPayments?.();
    // Reminders: the composer lives on the Tests tab.
    if (action.type === "remind") return openSection("tests", consoleAnchor.reminders);
    if (action.type === "approve-session") return reviewSessionRequest(action.taskId, "approved");
    setBusyItem(item.id);
    try {
      if (action.type === "grade" || action.type === "release-review") {
        const mocks = await import("../lib/cloudMockTests");
        const attempt = consoleData.attempts?.find((entry) => entry.id === action.attemptId);
        if (!attempt) throw new Error("That attempt is no longer available. Refresh and try again.");
        if (action.type === "grade") {
          const graded = await mocks.tutorGradeMockAttempt(attempt);
          notifyAndRefresh(`Graded: ${graded.score ?? "?"}/8.`);
        } else {
          await mocks.setMockReviewReleased(attempt.id, true);
          notifyAndRefresh("Review released to Hamad.");
        }
      } else if (action.type === "unlock-bank") {
        const { savePracticeAssignment } = await import("../lib/cloud");
        const assigned = consoleData.assignedBankIds ?? [];
        if (!assigned.includes(action.storageId)) await savePracticeAssignment([...assigned, action.storageId]);
        notifyAndRefresh("Practice module unlocked for Hamad.");
      }
    } catch (cause) {
      notify(cause instanceof Error ? cause.message : "That action did not complete.", "warning");
    } finally {
      setBusyItem(null);
    }
  };

  const pickEntry = (entry: ConsoleEntry) => {
    if (entry.kind === "session") chooseSession(Number(entry.id.replace("session-", "")));
    onSection(entry.section);
    setPendingAnchor(entry.anchor);
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

  const approvalQueue = (
    <section className="panel approval-queue" id={consoleAnchor.approvals}>
      <div className="panel-heading"><div><p className="eyebrow">Tutor approval</p><h3>Session completion queue</h3></div><CircleCheckBig size={21} /></div>
      {pendingSessionRequests.length ? <div className="entry-list">{pendingSessionRequests.map(({ task, request }) => <article className="approval-entry" key={task.id}><div><strong>{task.label}</strong><span>Requested {request ? new Date(request.requestedAt).toLocaleString() : ""}</span></div><div className="inline-actions"><button className="button button-primary" type="button" onClick={() => reviewSessionRequest(task.id, "approved")}><Check size={16} /> Approve</button><button className="button button-secondary" type="button" onClick={() => reviewSessionRequest(task.id, "returned")}><RotateCcw size={16} /> Return</button></div></article>)}</div> : <EmptyState icon={CircleCheckBig} title="No approvals waiting">Hamad&apos;s session-completion requests will appear here.</EmptyState>}
    </section>
  );

  return (
    <div className="view-stack tutor-console">
      <TutorQuickFind entries={entries} onPick={pickEntry} />
      <SectionTabs
        label="Tutor Admin sections"
        idPrefix="coach"
        items={TUTOR_SECTIONS.map((item) => ({ ...item, icon: SECTION_ICON[item.id], count: counts[item.id], countLabel: "waiting" }))}
        active={section}
        onSelect={onSection}
      />
      <SectionPanel idPrefix="coach" active={section}>
        {section === "overview" && (
          <TutorOverview
            glance={glance}
            data={consoleData}
            nextSession={nextSession ? { number: nextSession.session.number, date: nextSession.effectiveDate, title: nextSession.session.title } : null}
            today={new Date()}
            onSection={onSection}
            onOpenPayments={onOpenPayments}
            brief={<TutorBriefPanel tracker={tracker} />}
            inbox={(
              <TutorInbox
                items={visibleInbox}
                hiddenCount={inbox.length - visibleInbox.length}
                loading={consoleData.loading}
                busyId={busyItem}
                onAction={(item) => void runInboxAction(item)}
                onSnooze={snooze}
                onShowHidden={showHidden}
              />
            )}
            insights={<TutorInsights pace={pace} standings={standings} suggestions={suggestions} loading={consoleData.loading} onSuggestion={runSuggestion} />}
          />
        )}
        {section === "tests" && <Suspense fallback={null}><MockTestAdmin notify={notifyAndRefresh} /></Suspense>}
        {section === "practice" && <Suspense fallback={null}><PracticeBankAdmin notify={notifyAndRefresh} /></Suspense>}
        {section === "sessions" && (
          <div className="view-stack">
            <SessionPrepPanel
              prep={prep}
              loading={consoleData.loading}
              onCopy={(text) => void copyAgenda(text)}
              onRemind={() => openSection("tests", consoleAnchor.reminders)}
              onOpenSessionMode={onOpenSessionMode}
            />
            {approvalQueue}
            <section className="form-and-list tutor-tool-grid">
              <form className="panel entry-form" id={consoleAnchor.reschedule} onSubmit={submitReschedule}>
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
          </div>
        )}
        {section === "activity" && <TutorActivity events={activity} nowMs={nowMs} loading={consoleData.loading} />}
        {section === "records" && (
          <div className="view-stack">
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

            <section className="panel danger-zone">
              <div><p className="eyebrow">Protected recovery control</p><h3>Export, then reset all shared progress</h3><p>Use only before genuine course work begins. This creates a local JSON recovery copy before replacing the synchronized tracker on every device.</p></div>
              <button className="button button-danger" type="button" disabled={authoritativeReplaceBusy || syncStatus !== "synced"} onClick={() => void resetSharedProgress()}><Trash2 size={16} />{authoritativeReplaceBusy ? "Resetting..." : "Export and reset"}</button>
            </section>
          </div>
        )}
      </SectionPanel>
    </div>
  );
}
