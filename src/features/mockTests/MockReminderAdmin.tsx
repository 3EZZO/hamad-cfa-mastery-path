import { BellRing, CircleAlert, Pencil, Send, XCircle } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAppDialog } from "../../components/AppDialog";
import { MOCK_MODULES, mockModuleById } from "../../data/mockModules";
import { getCloudErrorMessage, type ProjectMember } from "../../lib/cloud";
import { cancelMockReminder, editMockReminder, listMockReminders, sendMockReminder } from "../../lib/cloudMockReminders";
import {
  DEFAULT_REMINDER_MESSAGE,
  REMINDER_MESSAGE_MAX,
  deadlineCountdown,
  formatReminderDate,
  localDay,
  reminderProgress,
  validateReminderDraft,
  type MockReminder,
  type ReminderProgress,
} from "../../lib/mockReminders";
import { isMockAttemptLocked, mockAttemptId, type MockAttempt, type MockTestMeta } from "../../lib/mockTestContent";

type Notify = (message: string, tone?: "success" | "warning") => void;

/** The date in the default message; used as the default deadline until it passes. */
const DEFAULT_DEADLINE = "2026-10-01";

const PROGRESS_LABEL: Record<ReminderProgress, string> = {
  sent: "Sent",
  seen: "Seen",
  acknowledged: "Acknowledged",
  completed: "Tests completed",
  expired: "Deadline passed",
  cancelled: "Cancelled",
};

function studentName(students: ProjectMember[], uid: string): string {
  // Member records carry no names; this program has one student, Hamad.
  return students.length === 1 && students[0].uid === uid ? "Hamad" : `Student ${uid.slice(0, 6)}`;
}

function when(ms: number | null): string {
  return ms === null ? "" : new Date(ms).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

export function MockReminderAdmin({
  students,
  metas,
  attempts,
  notify,
}: {
  students: ProjectMember[];
  metas: MockTestMeta[];
  attempts: MockAttempt[];
  notify: Notify;
}) {
  const dialog = useAppDialog();
  const [reminders, setReminders] = useState<MockReminder[]>([]);
  const [studentUid, setStudentUid] = useState("");
  const [message, setMessage] = useState(DEFAULT_REMINDER_MESSAGE);
  const [deadline, setDeadline] = useState(() => (localDay(Date.now()) <= DEFAULT_DEADLINE ? DEFAULT_DEADLINE : ""));
  const [moduleIds, setModuleIds] = useState<string[] | null>(null);
  const [editing, setEditing] = useState<MockReminder | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    try {
      setReminders(await listMockReminders());
    } catch (cause) {
      setError(getCloudErrorMessage(cause));
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    if (!studentUid && students.length) setStudentUid(students[0].uid);
  }, [studentUid, students]);

  const published = useMemo(
    () => MOCK_MODULES.filter(module => metas.some(meta => meta.moduleId === module.id && meta.status === "published")),
    [metas],
  );
  const completedFor = useCallback(
    (uid: string) => MOCK_MODULES
      .filter(module => {
        const attempt = attempts.find(entry => entry.id === mockAttemptId(uid, module.id));
        return attempt ? isMockAttemptLocked(attempt) : false;
      })
      .map(module => module.id),
    [attempts],
  );
  const defaultModules = useMemo(
    () => published.map(module => module.id).filter(id => !completedFor(studentUid).includes(id)),
    [published, completedFor, studentUid],
  );
  // Until the tutor ticks a box, follow the default (published, not yet completed).
  const selected = moduleIds ?? defaultModules;

  const toggle = (id: string) => {
    setModuleIds(current => {
      const base = current ?? defaultModules;
      return base.includes(id) ? base.filter(entry => entry !== id) : [...base, id];
    });
  };

  const resetComposer = () => {
    setEditing(null);
    setMessage(DEFAULT_REMINDER_MESSAGE);
    setDeadline(localDay(Date.now()) <= DEFAULT_DEADLINE ? DEFAULT_DEADLINE : "");
    setModuleIds(null);
    setError("");
  };

  const submit = async () => {
    const draft = { studentUid, message, deadline: deadline || null, moduleIds: selected };
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
      await refresh();
    } catch (cause) {
      setError(getCloudErrorMessage(cause));
    } finally {
      setBusy(false);
    }
  };

  const startEdit = (reminder: MockReminder) => {
    setEditing(reminder);
    setStudentUid(reminder.studentUid);
    setMessage(reminder.message);
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
      await refresh();
    } catch (cause) {
      setError(getCloudErrorMessage(cause));
    } finally {
      setBusy(false);
    }
  };

  const nowMs = Date.now();

  return (
    <section className="mock-reminder-admin" aria-labelledby="mock-reminder-admin-title">
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
              <select value={studentUid} disabled={Boolean(editing)} onChange={event => { setStudentUid(event.target.value); setModuleIds(null); }}>
                {students.map(student => <option key={student.uid} value={student.uid}>{studentName(students, student.uid)}</option>)}
              </select>
            </label>
          )}
          <label className="mock-reminder-admin__message">
            <span>Message</span>
            <textarea value={message} maxLength={REMINDER_MESSAGE_MAX} rows={3} onChange={event => setMessage(event.target.value)} />
          </label>
          <label className="mock-reminder-admin__deadline">
            <span>Deadline <small>(optional)</small></span>
            <input type="date" value={deadline} min={localDay(nowMs)} onChange={event => setDeadline(event.target.value)} />
            {deadline && <small>{formatReminderDate(deadline)} · {deadlineCountdown(deadline, nowMs)}. Shows again daily until done.</small>}
          </label>
          <fieldset className="mock-reminder-admin__modules">
            <legend>Modules</legend>
            {published.length === 0 ? <p>No published module tests yet.</p> : published.map(module => {
              const done = completedFor(studentUid).includes(module.id);
              return (
                <label key={module.id} className={done ? "is-done" : ""}>
                  <input type="checkbox" checked={selected.includes(module.id)} onChange={() => toggle(module.id)} />
                  Module {module.number}{done && <small> · completed</small>}
                </label>
              );
            })}
          </fieldset>
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
                    <td>{reminder.moduleIds.map(id => mockModuleById(id)?.number ?? id).join(", ")}</td>
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
