import { BellRing, CircleAlert, Pencil, Send, Sparkles, XCircle } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { useAppDialog } from "../../components/AppDialog";
import { MOCK_MODULES, MOCK_TOPICS, mockModuleById, mockModuleCode, mockModuleLabel } from "../../data/mockModules";
import { getCloudErrorMessage, type ProjectMember } from "../../lib/cloud";
import { cancelMockReminder, editMockReminder, sendMockReminder } from "../../lib/cloudMockReminders";
import { getProgramWeek } from "../../lib/dates";
import {
  REMINDER_MESSAGE_MAX,
  deadlineCountdown,
  deadlinePassed,
  formatReminderDate,
  localDay,
  reminderProgress,
  validateReminderDraft,
  type MockReminder,
  type ReminderProgress,
} from "../../lib/mockReminders";
import { isMockAttemptLocked, mockAttemptId, type MockAttempt, type MockTestMeta } from "../../lib/mockTestContent";
import { REMINDER_TONES, composeReminderMessage, daysFromNow, type ReminderPreset, type ReminderTone } from "../../lib/reminderComposer";
import { deadlinesByModule } from "../../lib/testBoard";
import { consoleAnchor } from "../../lib/tutorConsole";
import { testsForWeek } from "../../lib/weekTests";

type Notify = (message: string, tone?: "success" | "warning") => void;

const PROGRESS_LABEL: Record<ReminderProgress, string> = {
  sent: "Sent",
  seen: "Seen",
  acknowledged: "Acknowledged",
  completed: "Tests completed",
  expired: "Deadline passed",
  cancelled: "Cancelled",
};

const QUICK_DEADLINES: ReadonlyArray<{ label: string; days: number | null }> = [
  { label: "Tomorrow", days: 1 },
  { label: "In 3 days", days: 3 },
  { label: "In a week", days: 7 },
  { label: "No deadline", days: null },
];

function studentName(students: ProjectMember[], uid: string): string {
  // Member records carry no names; this program has one student, Hamad.
  return students.length === 1 && students[0].uid === uid ? "Hamad" : `Student ${uid.slice(0, 6)}`;
}

function when(ms: number | null): string {
  return ms === null ? "" : new Date(ms).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

const codes = (moduleIds: readonly string[]) =>
  moduleIds.map(id => { const module = mockModuleById(id); return module ? mockModuleCode(module) : id; }).join(", ");

/**
 * The reminder composer and history. The message writes itself from the
 * chosen tests, the deadline, the tone and Hamad's recent results until the
 * tutor edits it. The parent owns the reminder list (`reminders`,
 * `onChanged`) and remounts this panel with a `preset` to prefill it.
 */
export function MockReminderAdmin({
  students,
  metas,
  attempts,
  reminders,
  onChanged,
  notify,
  preset = null,
}: {
  students: ProjectMember[];
  metas: MockTestMeta[];
  attempts: MockAttempt[];
  reminders: MockReminder[];
  onChanged: () => Promise<void> | void;
  notify: Notify;
  preset?: ReminderPreset | null;
}) {
  const dialog = useAppDialog();
  const [studentUid, setStudentUid] = useState("");
  const [tone, setTone] = useState<ReminderTone>(preset?.tone ?? "friendly");
  const [deadline, setDeadline] = useState(preset?.deadline ?? "");
  const [moduleIds, setModuleIds] = useState<string[] | null>(preset ? [...preset.moduleIds] : null);
  const [autoMessage, setAutoMessage] = useState(true);
  const [customMessage, setCustomMessage] = useState("");
  const [editing, setEditing] = useState<MockReminder | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const uid = studentUid || students[0]?.uid || "";
  const nowMs = Date.now();

  const published = useMemo(
    () => MOCK_MODULES.filter(module => metas.some(meta => meta.moduleId === module.id && meta.status === "published")),
    [metas],
  );
  const completedFor = useCallback(
    (forUid: string) => MOCK_MODULES
      .filter(module => {
        const attempt = attempts.find(entry => entry.id === mockAttemptId(forUid, module.id));
        return attempt ? isMockAttemptLocked(attempt) : false;
      })
      .map(module => module.id),
    [attempts],
  );
  const completed = completedFor(uid);
  const pending = published.map(module => module.id).filter(id => !completed.includes(id));
  // Until the tutor ticks a box or picks a preset, follow the default (published, not yet completed).
  const selected = moduleIds ?? pending;

  const deadlines = deadlinesByModule(reminders, uid || null);
  const weekIds = new Set(testsForWeek(getProgramWeek(new Date(nowMs))).map(module => module.id));
  const presets: Array<{ label: string; ids: string[]; tone?: ReminderTone }> = [
    { label: "This week's tests", ids: pending.filter(id => weekIds.has(id)) },
    { label: "Everything pending", ids: pending },
    { label: "Overdue", ids: pending.filter(id => { const due = deadlines.get(id); return due !== undefined && deadlinePassed(due, nowMs); }), tone: "overdue" },
    ...MOCK_TOPICS.map(topic => ({ label: `Pending ${topic}`, ids: pending.filter(id => mockModuleById(id)?.topic === topic) })),
  ];

  const recent = attempts
    .filter(attempt => attempt.uid === uid && attempt.score !== null && attempt.submittedAtMs !== null)
    .sort((left, right) => (right.submittedAtMs ?? 0) - (left.submittedAtMs ?? 0))
    .map(attempt => ({ moduleId: attempt.moduleId, score: attempt.score! }));
  const message = autoMessage
    ? composeReminderMessage({ moduleIds: selected, deadline: deadline || null, nowMs, tone, recent })
    : customMessage;

  const toggle = (id: string) => {
    setModuleIds(current => {
      const base = current ?? pending;
      return base.includes(id) ? base.filter(entry => entry !== id) : [...base, id];
    });
  };

  const applyPreset = (ids: string[], presetTone?: ReminderTone) => {
    setModuleIds(ids);
    if (presetTone) setTone(presetTone);
    setError("");
  };

  const resetComposer = () => {
    setEditing(null);
    setTone("friendly");
    setDeadline("");
    setModuleIds(null);
    setAutoMessage(true);
    setCustomMessage("");
    setError("");
  };

  const submit = async () => {
    const draft = { studentUid: uid, message, deadline: deadline || null, moduleIds: selected };
    const problem = validateReminderDraft(draft);
    if (problem) {
      setError(problem);
      return;
    }
    setBusy(true);
    setError("");
    try {
      if (editing) {
        await editMockReminder(editing.id, draft);
        notify("Reminder updated. The student will see it again.");
      } else {
        await sendMockReminder(draft);
        notify("Reminder sent. It will pop up on the student's app.");
      }
      resetComposer();
      await onChanged();
    } catch (cause) {
      setError(getCloudErrorMessage(cause));
    } finally {
      setBusy(false);
    }
  };

  const startEdit = (reminder: MockReminder) => {
    setEditing(reminder);
    setStudentUid(reminder.studentUid);
    setAutoMessage(false);
    setCustomMessage(reminder.message);
    setDeadline(reminder.deadline ?? "");
    setModuleIds(reminder.moduleIds);
    setError("");
  };

  const cancel = async (reminder: MockReminder) => {
    const ok = await dialog.confirm("Cancel this reminder? It stops appearing on the student's app. It stays in this history.");
    if (!ok) return;
    setBusy(true);
    try {
      await cancelMockReminder(reminder.id);
      if (editing?.id === reminder.id) resetComposer();
      notify("Reminder cancelled.");
      await onChanged();
    } catch (cause) {
      setError(getCloudErrorMessage(cause));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="mock-reminder-admin" id={consoleAnchor.reminders} aria-labelledby="mock-reminder-admin-title">
      <div className="mock-reminder-admin__head">
        <BellRing size={19} aria-hidden="true" />
        <div>
          <h4 id="mock-reminder-admin-title">{editing ? "Edit reminder" : "Send reminder"}</h4>
          <p>Opens as a window on the student's app until they press “Got it”. It never interrupts a test in progress.</p>
        </div>
      </div>

      {students.length === 0 ? <p>No active student accounts.</p> : (
        <div className="mock-reminder-admin__form">
          {students.length > 1 && (
            <label>
              <span>Student</span>
              <select value={uid} disabled={Boolean(editing)} onChange={event => { setStudentUid(event.target.value); setModuleIds(null); }}>
                {students.map(student => <option key={student.uid} value={student.uid}>{studentName(students, student.uid)}</option>)}
              </select>
            </label>
          )}
          <div className="mock-reminder-admin__presets" role="group" aria-label="Choose tests">
            {presets.map(option => (
              <button key={option.label} type="button" className="mock-reminder-admin__chip" disabled={option.ids.length === 0} onClick={() => applyPreset(option.ids, option.tone)}>
                {option.label} ({option.ids.length})
              </button>
            ))}
          </div>
          <fieldset className="mock-reminder-admin__modules">
            <legend>Tests</legend>
            {published.length === 0 ? <p>No published module tests yet.</p> : published.map(module => {
              const done = completed.includes(module.id);
              return (
                <label key={module.id} className={done ? "is-done" : ""}>
                  <input type="checkbox" checked={selected.includes(module.id)} onChange={() => toggle(module.id)} />
                  {mockModuleLabel(module)}{done && <small> · completed</small>}
                </label>
              );
            })}
          </fieldset>
          <label className="mock-reminder-admin__deadline">
            <span>Deadline <small>(optional)</small></span>
            <input type="date" value={deadline} min={localDay(nowMs)} onChange={event => setDeadline(event.target.value)} />
            <span className="mock-reminder-admin__quick">
              {QUICK_DEADLINES.map(option => (
                <button key={option.label} type="button" className="mock-reminder-admin__chip" onClick={() => setDeadline(option.days === null ? "" : daysFromNow(nowMs, option.days))}>{option.label}</button>
              ))}
            </span>
            {deadline && <small>{formatReminderDate(deadline)} · {deadlineCountdown(deadline, nowMs)}. Shows again daily until done.</small>}
          </label>
          <div className="mock-reminder-admin__tone" role="group" aria-label="Tone">
            <span>Tone</span>
            <div>
              {REMINDER_TONES.map(option => (
                <button key={option.id} type="button" className="mock-reminder-admin__chip" aria-pressed={tone === option.id} onClick={() => setTone(option.id)}>{option.label}</button>
              ))}
            </div>
          </div>
          <label className="mock-reminder-admin__message">
            <span>Message</span>
            <textarea
              value={message}
              maxLength={REMINDER_MESSAGE_MAX}
              rows={4}
              onChange={event => { setAutoMessage(false); setCustomMessage(event.target.value); }}
            />
            {autoMessage
              ? <small><Sparkles size={13} aria-hidden="true" /> Written from the tests, deadline, tone and recent results. Type to write your own.</small>
              : <button type="button" className="mock-reminder-admin__chip" onClick={() => setAutoMessage(true)}><Sparkles size={14} aria-hidden="true" /> Write it for me again</button>}
          </label>
          <div className="mock-reminder-admin__preview" aria-label="Preview of the student's reminder">
            <small>How Hamad sees it</small>
            <p>{message || "—"}</p>
            <small>
              {selected.length ? codes(selected) : "No tests chosen"}
              {deadline ? ` · due ${formatReminderDate(deadline)} (${deadlineCountdown(deadline, nowMs).toLowerCase()})` : ""}
            </small>
          </div>
          {error && <p className="form-error" role="alert"><CircleAlert size={16} />{error}</p>}
          <div className="mock-reminder-admin__actions">
            {editing && (
              <button type="button" className="button" disabled={busy} onClick={resetComposer}>Discard changes</button>
            )}
            <button type="button" className="button button-primary" disabled={busy || published.length === 0} onClick={() => void submit()}>
              <Send size={16} />{busy ? "Working…" : editing ? "Save and resend" : "Send reminder"}
            </button>
          </div>
        </div>
      )}

      <h5 className="mock-reminder-admin__history-title">Reminder history</h5>
      {reminders.length === 0 ? <p className="mock-reminder-admin__empty">No reminders sent yet.</p> : (
        <div className="mock-table-wrap">
          <table className="mock-table mock-reminder-admin__history">
            <thead>
              <tr>
                <th scope="col">Sent</th>
                {students.length > 1 && <th scope="col">Student</th>}
                <th scope="col">Modules</th>
                <th scope="col">Deadline</th>
                <th scope="col">Status</th>
                <th scope="col">Seen</th>
                <th scope="col">Acknowledged</th>
                <th scope="col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {reminders.map(reminder => {
                const progress = reminderProgress(reminder, completedFor(reminder.studentUid), nowMs);
                return (
                  <tr key={reminder.id}>
                    <th scope="row" title={reminder.message}>
                      {when(reminder.createdAtMs)}
                      {reminder.editedAtMs !== null && <small> · edited {when(reminder.editedAtMs)}</small>}
                    </th>
                    {students.length > 1 && <td>{studentName(students, reminder.studentUid)}</td>}
                    <td>{codes(reminder.moduleIds)}</td>
                    <td>{reminder.deadline ? formatReminderDate(reminder.deadline) : "—"}</td>
                    <td><span className={`mock-reminder-status mock-reminder-status--${progress}`}>{PROGRESS_LABEL[progress]}</span></td>
                    <td>{when(reminder.seenAtMs) || "—"}</td>
                    <td>{when(reminder.acknowledgedAtMs) || "—"}</td>
                    <td className="mock-admin__row-actions">
                      {reminder.status === "active" && (
                        <>
                          <button type="button" className="button" disabled={busy} onClick={() => startEdit(reminder)}>
                            <Pencil size={15} />Edit
                          </button>
                          <button type="button" className="button" disabled={busy} onClick={() => void cancel(reminder)}>
                            <XCircle size={15} />Cancel
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
