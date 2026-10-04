import { BadgeCheck, BellRing, CalendarClock, CalendarX, ClipboardCheck, CircleAlert, CloudUpload, Eye, EyeOff, History, RotateCcw, TimerOff, Unlock } from "lucide-react";
import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { useAppDialog } from "../../components/AppDialog";
import { MOCK_MODULES, MOCK_TOPICS, mockModuleById, mockModuleCode, mockModuleLabel, mockModulesInTopic, type MockTopic } from "../../data/mockModules";
import { analyzeKeystrokes } from "../../lib/calculatorDiagnostics";
import { getCloudErrorMessage, listActiveStudentMembers, type ProjectMember } from "../../lib/cloud";
import {
  listMockAttemptHistory,
  listMockAttempts,
  listMockTestMetas,
  loadMockTestPackage,
  resetMockAttempt,
  setMockReviewReleased,
  setMockTestPublished,
  tutorGradeMockAttempt,
  uploadMockTestDraft,
  type MockTestPackage,
} from "../../lib/cloudMockTests";
import {
  MOCK_QUESTION_COUNT,
  formatMockClock,
  incidentLabel,
  isMockAttemptLocked,
  mockAttemptId,
  mockAttemptView,
  mockTimeUsedMs,
  optionLetter,
  type MockAttempt,
  type MockAttemptHistoryEntry,
  type MockOption,
  type MockTestMeta,
} from "../../lib/mockTestContent";
import { cancelMockReminder, editMockReminder, listMockReminders, sendMockReminder } from "../../lib/cloudMockReminders";
import { deadlineCountdown, deadlinePassed, formatReminderDate, isReminderDate, localDay, type MockReminder } from "../../lib/mockReminders";
import { clearDeadlineChanges, composeReminderMessage, daysFromNow, overdueDraft, type ReminderPreset, type ReminderTone } from "../../lib/reminderComposer";
import { deadlinesByModule } from "../../lib/testBoard";
import { consoleAnchor } from "../../lib/tutorConsole";
import { MockAnswerKeyReview } from "./MockAnswerKeyReview";
import { MockReminderAdmin } from "./MockReminderAdmin";
import "./moduleMock.css";

type Notify = (message: string, tone?: "success" | "warning") => void;

const FINISH: Record<string, string> = {
  submit: "Submitted",
  timeout: "Auto-submitted at 00:00",
  expired: "Expired while away",
  leave: "Forfeited (Leave Test)",
};

/** Scroll a panel element into view (guarded for non-browser renders). */
function reveal(id: string) {
  if (typeof document === "undefined") return;
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

export function MockTestAdmin({ notify, reminderPreset = null }: {
  notify: Notify;
  /** Prefills the reminder composer (e.g. from Tutor Admin's inbox); a new object applies again. */
  reminderPreset?: ReminderPreset | null;
}) {
  const dialog = useAppDialog();
  const input = useRef<HTMLInputElement>(null);
  const [metas, setMetas] = useState<MockTestMeta[]>([]);
  const [attempts, setAttempts] = useState<MockAttempt[]>([]);
  const [history, setHistory] = useState<MockAttemptHistoryEntry[]>([]);
  const [students, setStudents] = useState<ProjectMember[]>([]);
  const [keys, setKeys] = useState<Record<string, MockOption[]>>({});
  // Answers below High confidence per uploaded test, shown before a bulk publish.
  const [lowConfidence, setLowConfidence] = useState<Record<string, number>>({});
  const [resultsTopic, setResultsTopic] = useState<MockTopic | "all">("all");
  const [reviewing, setReviewing] = useState<MockTestPackage | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [reminders, setReminders] = useState<MockReminder[]>([]);
  // The composer remounts with each new preset (its own or one handed down).
  const [preset, setPreset] = useState<ReminderPreset | null>(reminderPreset);
  const [presetSerial, setPresetSerial] = useState(0);
  const [seenPreset, setSeenPreset] = useState(reminderPreset);
  if (reminderPreset !== seenPreset) {
    setSeenPreset(reminderPreset);
    if (reminderPreset) {
      setPreset(reminderPreset);
      setPresetSerial(presetSerial + 1);
    }
  }
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    try {
      const [nextMetas, nextAttempts, nextHistory, nextStudents] = await Promise.all([
        listMockTestMetas(),
        listMockAttempts(),
        listMockAttemptHistory(),
        listActiveStudentMembers(),
      ]);
      setMetas(nextMetas);
      setAttempts(nextAttempts);
      setHistory(nextHistory);
      setStudents(nextStudents);
      const packages = await Promise.all(nextMetas.map(meta => loadMockTestPackage(meta.moduleId).catch(() => null)));
      setKeys(Object.fromEntries(packages.filter(Boolean).map(pkg => [pkg!.meta.moduleId, pkg!.key.correct])));
      setLowConfidence(Object.fromEntries(packages.filter(Boolean).map(pkg => [
        pkg!.meta.moduleId,
        pkg!.review.items.filter(item => item.confidence !== "High").length,
      ])));
    } catch (cause) {
      setError(getCloudErrorMessage(cause));
    }
  }, []);

  const refreshReminders = useCallback(async () => {
    try {
      setReminders(await listMockReminders());
    } catch (cause) {
      setError(getCloudErrorMessage(cause));
    }
  }, []);

  useEffect(() => { void refresh(); void refreshReminders(); }, [refresh, refreshReminders]);

  // This program has one student; the row controls act for the first active one.
  const studentUid = students[0]?.uid ?? null;
  const deadlines = deadlinesByModule(reminders, studentUid);
  const attemptFor = (moduleId: string) => (studentUid ? attempts.find(entry => entry.id === mockAttemptId(studentUid, moduleId)) ?? null : null);
  const isDone = (moduleId: string) => { const attempt = attemptFor(moduleId); return attempt ? isMockAttemptLocked(attempt) : false; };
  const label = (ids: readonly string[]) => ids.map(id => { const module = mockModuleById(id); return module ? mockModuleCode(module) : id; }).join(", ");

  const remind = (moduleIds: string[], tone: ReminderTone = "friendly") => {
    setPreset({ moduleIds, tone });
    setPresetSerial(serial => serial + 1);
    reveal(consoleAnchor.reminders);
  };

  const markOverdue = async (moduleIds: string[]) => {
    if (!studentUid || moduleIds.length === 0) return;
    const ok = await dialog.confirm(
      `Mark ${label(moduleIds)} overdue? They show as overdue on Hamad's Tests page from now (a reminder dated yesterday). `
        + "No pop-up appears for a passed deadline; send a reminder too if you want him notified.",
    );
    if (!ok) return;
    setBusy(true);
    try {
      await sendMockReminder(overdueDraft(studentUid, moduleIds, Date.now()));
      notify(`${label(moduleIds)} marked overdue.`);
      await refreshReminders();
    } catch (cause) {
      setError(getCloudErrorMessage(cause));
    } finally {
      setBusy(false);
    }
  };

  const clearDeadline = async (moduleIds: string[]) => {
    if (!studentUid) return;
    const changes = clearDeadlineChanges(reminders, studentUid, moduleIds);
    if (changes.length === 0) return;
    const edits = changes.filter(change => change.type === "edit").length;
    const ok = await dialog.confirm(
      `Clear the deadline for ${label(moduleIds)}? ${changes.length - edits} ${changes.length - edits === 1 ? "reminder is" : "reminders are"} cancelled`
        + (edits ? ` and ${edits} ${edits === 1 ? "reminder that also lists other tests is" : "reminders that also list other tests are"} re-sent without them` : "")
        + ".",
    );
    if (!ok) return;
    setBusy(true);
    const failures: string[] = [];
    for (const change of changes) {
      try {
        if (change.type === "cancel") await cancelMockReminder(change.reminder.id);
        else await editMockReminder(change.reminder.id, change.draft);
      } catch (cause) {
        failures.push(getCloudErrorMessage(cause));
      }
    }
    if (failures.length) setError(failures.join("\n"));
    else notify(`Deadline cleared for ${label(moduleIds)}.`);
    await refreshReminders();
    setBusy(false);
  };

  /** One reminder with one due date for every pending published test in a topic. */
  const setTopicDueDate = async (topic: MockTopic, moduleIds: string[]) => {
    if (!studentUid || moduleIds.length === 0) return;
    const nowMs = Date.now();
    const value = await dialog.prompt(`Due date for ${moduleIds.length} pending ${topic} ${moduleIds.length === 1 ? "test" : "tests"} (${label(moduleIds)}), as YYYY-MM-DD:`, daysFromNow(nowMs, 7));
    if (value === null) return;
    const deadline = value.trim();
    if (!isReminderDate(deadline) || deadline < localDay(nowMs)) {
      setError("Enter a date from today onwards, as YYYY-MM-DD.");
      return;
    }
    setBusy(true);
    try {
      await sendMockReminder({
        studentUid, moduleIds, deadline,
        message: composeReminderMessage({ moduleIds, deadline, nowMs, tone: "friendly" }),
      });
      notify(`${label(moduleIds)} due ${formatReminderDate(deadline)}. Hamad gets a reminder.`);
      await refreshReminders();
    } catch (cause) {
      setError(getCloudErrorMessage(cause));
    } finally {
      setBusy(false);
    }
  };

  const openResult = (module: (typeof MOCK_MODULES)[number]) => {
    if (!studentUid) return;
    const rowKey = `${studentUid}-${module.id}`;
    setResultsTopic(module.topic);
    setExpanded(rowKey);
    window.setTimeout(() => reveal(`mock-result-${rowKey}`), 50);
  };

  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true);
    setError("");
    const failures: string[] = [];
    for (const file of Array.from(files)) {
      try {
        const meta = await uploadMockTestDraft(JSON.parse(await file.text()));
        notify(`${meta.title} uploaded as a draft. Review the answer key before publishing.`);
      } catch (cause) {
        failures.push(`${file.name}: ${cause instanceof Error && cause.cause instanceof Error ? cause.cause.message : getCloudErrorMessage(cause)}`);
      }
    }
    if (failures.length) setError(failures.join("\n"));
    if (input.current) input.current.value = "";
    await refresh();
    setBusy(false);
  };

  const openReview = async (moduleId: string) => {
    setBusy(true);
    try {
      const pkg = await loadMockTestPackage(moduleId);
      if (pkg) setReviewing(pkg);
    } catch (cause) {
      setError(getCloudErrorMessage(cause));
    } finally {
      setBusy(false);
    }
  };

  const unpublish = async (meta: MockTestMeta) => {
    const started = attempts.some(attempt => attempt.moduleId === meta.moduleId);
    const ok = await dialog.confirm(
      started
        ? `A student has already started ${meta.title}. Unpublishing hides it from students who have not started; existing attempts keep their results. Continue?`
        : `Unpublish ${meta.title}? It returns to Draft and the student will no longer see it.`,
    );
    if (!ok) return;
    setBusy(true);
    try {
      await setMockTestPublished(meta, false);
      notify(`${meta.title} is back in Draft.`);
      await refresh();
    } catch (cause) {
      setError(getCloudErrorMessage(cause));
    } finally {
      setBusy(false);
    }
  };

  const reset = async (attempt: MockAttempt, studentName: string) => {
    const module = mockModuleById(attempt.moduleId);
    const ok = await dialog.confirm(
      `Reset ${studentName}'s ${module ? mockModuleLabel(module) : attempt.moduleId} attempt? The current attempt is kept in the history and ${studentName} can take the test again. `
        + "If the review was released, the student has already seen the answers: consider uploading a new version first.",
    );
    if (!ok) return;
    setBusy(true);
    try {
      await resetMockAttempt(attempt.id);
      notify("Attempt archived and reset.");
      await refresh();
    } catch (cause) {
      setError(getCloudErrorMessage(cause));
    } finally {
      setBusy(false);
    }
  };

  const release = async (attempt: MockAttempt, released: boolean) => {
    setBusy(true);
    try {
      await setMockReviewReleased(attempt.id, released);
      notify(released ? "Answers and explanations released to the student." : "Review hidden again.");
      await refresh();
    } catch (cause) {
      setError(getCloudErrorMessage(cause));
    } finally {
      setBusy(false);
    }
  };

  /** Publish every draft in a topic after one confirmation that lists them. */
  const publishDrafts = async (topic: MockTopic, drafts: MockTestMeta[]) => {
    const list = drafts.map(meta => {
      const module = mockModuleById(meta.moduleId);
      const low = lowConfidence[meta.moduleId] ?? 0;
      const name = module ? `${mockModuleCode(module)} ${module.title}` : meta.title;
      return `${name} (version ${meta.version}${low ? `, ${low} ${low === 1 ? "answer" : "answers"} below High confidence` : ""})`;
    }).join("; ");
    const ok = await dialog.confirm(
      `Publish ${drafts.length} ${topic} ${drafts.length === 1 ? "draft" : "drafts"} without opening each answer-key screen? ${list}. `
        + "They become visible to the student immediately.",
    );
    if (!ok) return;
    setBusy(true);
    setError("");
    const failures: string[] = [];
    for (const meta of drafts) {
      try {
        await setMockTestPublished(meta, true);
      } catch (cause) {
        failures.push(`${meta.title}: ${getCloudErrorMessage(cause)}`);
      }
    }
    const published = drafts.length - failures.length;
    if (published) notify(`${published} ${topic} ${published === 1 ? "test" : "tests"} published.`);
    if (failures.length) setError(failures.join("\n"));
    await refresh();
    setBusy(false);
  };

  /** Release the review of every graded, unreleased attempt in a topic. */
  const releaseReviews = async (topic: MockTopic, pending: MockAttempt[]) => {
    const codes = pending.map(attempt => {
      const module = mockModuleById(attempt.moduleId);
      return module ? mockModuleCode(module) : attempt.moduleId;
    }).join(", ");
    const ok = await dialog.confirm(
      `Release the review for ${pending.length} ${topic} ${pending.length === 1 ? "test" : "tests"} (${codes})? `
        + "The student will see the answers and explanations.",
    );
    if (!ok) return;
    setBusy(true);
    setError("");
    const failures: string[] = [];
    for (const attempt of pending) {
      try {
        await setMockReviewReleased(attempt.id, true);
      } catch (cause) {
        failures.push(`${attempt.moduleId}: ${getCloudErrorMessage(cause)}`);
      }
    }
    const released = pending.length - failures.length;
    if (released) notify(`${released} ${released === 1 ? "review" : "reviews"} released.`);
    if (failures.length) setError(failures.join("\n"));
    await refresh();
    setBusy(false);
  };

  const grade = async (attempt: MockAttempt) => {
    setBusy(true);
    try {
      await tutorGradeMockAttempt(attempt);
      await refresh();
    } catch (cause) {
      setError(getCloudErrorMessage(cause));
    } finally {
      setBusy(false);
    }
  };

  if (reviewing) {
    return (
      <MockAnswerKeyReview
        pkg={reviewing}
        notify={notify}
        onBack={() => { setReviewing(null); void refresh(); }}
        onPublished={() => { setReviewing(null); void refresh(); }}
      />
    );
  }

  return (
    <section className="panel mock-admin" aria-labelledby="mock-admin-title">
      <div className="panel-heading">
        <div><p className="eyebrow">Module Mock Tests</p><h3 id="mock-admin-title">Tests, answer keys and results</h3></div>
        <ClipboardCheck size={21} />
      </div>
      <p className="practice-bank-admin__intro">
        Upload the private <code>*.mock.json</code> file for a module. It arrives as a <strong>Draft</strong>, invisible to the student,
        until you review the answer key and choose Approve &amp; Publish.
      </p>
      <input ref={input} type="file" accept="application/json,.json" multiple hidden onChange={event => void upload(event.target.files)} />
      <button type="button" className="button button-primary" disabled={busy} onClick={() => input.current?.click()}>
        <CloudUpload size={17} />{busy ? "Working…" : "Upload mock test JSON"}
      </button>
      {error && <p className="form-error" role="alert" style={{ whiteSpace: "pre-line" }}><CircleAlert size={16} />{error}</p>}

      {MOCK_TOPICS.map(topic => {
        const topicModules = mockModulesInTopic(topic);
        const topicMetas = metas.filter(meta => topicModules.some(module => module.id === meta.moduleId));
        const drafts = topicMetas.filter(meta => meta.status === "draft");
        const unreleased = attempts.filter(attempt => topicModules.some(module => module.id === attempt.moduleId)
          && attempt.status !== "active" && attempt.score !== null && !attempt.reviewReleased);
        const pendingInTopic = topicModules
          .filter(module => metas.some(meta => meta.moduleId === module.id && meta.status === "published") && !isDone(module.id))
          .map(module => module.id);
        return (
          <details key={topic} className="mock-admin__topic" open>
            <summary>
              <strong>{topic}</strong>
              <span>
                {topicMetas.length} of {topicModules.length} uploaded · {topicMetas.length - drafts.length} published
                {drafts.length > 0 && ` · ${drafts.length} ${drafts.length === 1 ? "draft" : "drafts"}`}
              </span>
            </summary>
            <div className="mock-admin__bulk">
              <button type="button" className="button" disabled={busy || drafts.length === 0} onClick={() => void publishDrafts(topic, drafts)}>
                <BadgeCheck size={16} />Publish all drafts ({drafts.length})
              </button>
              <button type="button" className="button" disabled={busy || unreleased.length === 0} onClick={() => void releaseReviews(topic, unreleased)}>
                <Unlock size={16} />Release all reviews ({unreleased.length})
              </button>
              <button type="button" className="button" disabled={busy || pendingInTopic.length === 0} onClick={() => void setTopicDueDate(topic, pendingInTopic)}>
                <CalendarClock size={16} />Set a due date ({pendingInTopic.length})
              </button>
              <button type="button" className="button" disabled={busy || pendingInTopic.length === 0} onClick={() => remind(pendingInTopic)}>
                <BellRing size={16} />Remind about pending
              </button>
            </div>
            <div className="mock-admin__modules">
              {topicModules.map(module => {
                const meta = metas.find(entry => entry.moduleId === module.id);
                const attempt = attemptFor(module.id);
                const done = isDone(module.id);
                const due = deadlines.get(module.id);
                const overdue = due !== undefined && !done && deadlinePassed(due, Date.now());
                const live = meta?.status === "published" && studentUid !== null;
                return (
                  <article key={module.id} id={consoleAnchor.test(module.id)} className="mock-admin__module">
                    <div>
                      <span>{mockModuleLabel(module)}</span>
                      <strong>{module.title}</strong>
                      <small>{meta ? `${meta.status === "published" ? "Published" : "Draft"} · version ${meta.version}` : "No test uploaded"}</small>
                      {live && (
                        <small className={overdue ? "mock-admin__due is-overdue" : "mock-admin__due"}>
                          {done
                            ? `Done${attempt?.score != null ? ` · ${attempt.score}/${MOCK_QUESTION_COUNT}` : ""}`
                            : overdue
                              ? `Overdue · was due ${formatReminderDate(due!)}`
                              : due
                                ? `Due ${formatReminderDate(due)} · ${deadlineCountdown(due, Date.now())}`
                                : attempt ? "In progress" : "No deadline"}
                        </small>
                      )}
                    </div>
                    {meta && (
                      <div className="mock-admin__actions">
                        <button type="button" className="button" disabled={busy} onClick={() => void openReview(module.id)}>
                          <Eye size={16} />{meta.status === "published" ? "View key" : "Review key"}
                        </button>
                        {meta.status === "published" && (
                          <button type="button" className="button" disabled={busy} onClick={() => void unpublish(meta)}>
                            <EyeOff size={16} />Unpublish
                          </button>
                        )}
                        {live && !done && (
                          <button type="button" className="button" disabled={busy} onClick={() => remind([module.id], overdue ? "overdue" : due ? "firm" : "friendly")}>
                            <BellRing size={16} />Remind
                          </button>
                        )}
                        {live && !done && !overdue && (
                          <button type="button" className="button" disabled={busy} onClick={() => void markOverdue([module.id])}>
                            <TimerOff size={16} />Mark overdue
                          </button>
                        )}
                        {live && !done && due && (
                          <button type="button" className="button" disabled={busy} onClick={() => void clearDeadline([module.id])}>
                            <CalendarX size={16} />Clear deadline
                          </button>
                        )}
                        {attempt && (
                          <button type="button" className="button" disabled={busy} onClick={() => openResult(module)}>
                            <ClipboardCheck size={16} />Result
                          </button>
                        )}
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          </details>
        );
      })}

      <MockReminderAdmin
        key={presetSerial}
        preset={preset}
        students={students}
        metas={metas}
        attempts={attempts}
        reminders={reminders}
        onChanged={refreshReminders}
        notify={notify}
      />

      <h4 className="mock-admin__subhead">Student results</h4>
      <div className="mock-switch" role="group" aria-label="Show results for">
        {(["all", ...MOCK_TOPICS] as const).map(topic => (
          <button key={topic} type="button" className="mock-switch__option" aria-pressed={resultsTopic === topic} onClick={() => setResultsTopic(topic)}>
            {topic === "all" ? "All topics" : topic}
          </button>
        ))}
      </div>
      {students.length === 0 ? <p>No active student accounts.</p> : (
        <div className="mock-table-wrap">
          <table className="mock-table mock-admin__results">
            <thead>
              <tr><th scope="col">Student</th><th scope="col">Module</th><th scope="col">Status</th><th scope="col">Score</th><th scope="col">Time used</th><th scope="col">Incidents</th><th scope="col">Actions</th></tr>
            </thead>
            <tbody>
              {students.flatMap(student => {
                // Modules without an uploaded test and without an attempt add nothing to the table.
                const listed = MOCK_MODULES.filter(module => (resultsTopic === "all" || module.topic === resultsTopic)
                  && (attempts.some(entry => entry.id === mockAttemptId(student.uid, module.id)) || metas.some(entry => entry.moduleId === module.id)));
                return listed.map((module, index) => {
                  const attempt = attempts.find(entry => entry.id === mockAttemptId(student.uid, module.id)) ?? null;
                  const firstOfTopic = index === 0 || listed[index - 1]!.topic !== module.topic;
                  const view = mockAttemptView(attempt, Date.now());
                  // Member records carry no names; this program has one student, Hamad.
                  const name = students.length === 1 ? "Hamad" : `Student ${student.uid.slice(0, 6)}`;
                  const rowKey = `${student.uid}-${module.id}`;
                  const archived = history.filter(entry => entry.id === mockAttemptId(student.uid, module.id));
                  return (
                    <Fragment key={rowKey}>
                      {firstOfTopic && (
                        <tr className="mock-admin__topic-row"><th scope="colgroup" colSpan={7}>{module.topic}</th></tr>
                      )}
                      <tr id={`mock-result-${rowKey}`}>
                        <th scope="row">{name}</th>
                        <td>{mockModuleLabel(module)}</td>
                        <td>{{ "not-started": "Not started", "in-progress": "In progress", expired: "Expired, not finalized", completed: "Completed", forfeited: "Forfeited" }[view]}</td>
                        <td>{attempt?.score != null ? `${attempt.score}/${MOCK_QUESTION_COUNT}` : attempt && view !== "in-progress" ? "Not graded" : "—"}</td>
                        <td>{attempt ? (mockTimeUsedMs(attempt) === null ? "—" : formatMockClock(mockTimeUsedMs(attempt)!)) : "—"}</td>
                        <td>{attempt ? attempt.incidents.length : "—"}</td>
                        <td className="mock-admin__row-actions">
                          {attempt && (
                            <button type="button" className="button" onClick={() => setExpanded(expanded === rowKey ? null : rowKey)}>
                              {expanded === rowKey ? "Hide" : "Details"}
                            </button>
                          )}
                          {attempt && attempt.status !== "active" && attempt.score === null && (
                            <button type="button" className="button" disabled={busy} onClick={() => void grade(attempt)}>Grade</button>
                          )}
                          {attempt && attempt.status !== "active" && (
                            <button type="button" className="button" disabled={busy} onClick={() => void release(attempt, !attempt.reviewReleased)}>
                              <Unlock size={15} />{attempt.reviewReleased ? "Hide review" : "Release review"}
                            </button>
                          )}
                          {attempt && (
                            <button type="button" className="button" disabled={busy} onClick={() => void reset(attempt, name)}>
                              <RotateCcw size={15} />Reset
                            </button>
                          )}
                        </td>
                      </tr>
                      {expanded === rowKey && attempt && (
                        <tr className="mock-admin__detail-row">
                          <td colSpan={7}>
                            <AttemptDetail attempt={attempt} keyAnswers={keys[module.id]} archived={archived} />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                });
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function AttemptDetail({
  attempt,
  keyAnswers,
  archived,
}: {
  attempt: MockAttempt;
  keyAnswers: MockOption[] | undefined;
  archived: MockAttemptHistoryEntry[];
}) {
  return (
    <div className="mock-admin__detail">
      <p>
        Attempt {attempt.attemptNumber} · started {new Date(attempt.startedAtMs).toLocaleString()} ·{" "}
        {attempt.finishReason ? FINISH[attempt.finishReason] : "still running"}
        {attempt.submittedAtMs ? ` at ${new Date(attempt.submittedAtMs).toLocaleTimeString()}` : ""}
      </p>
      <ol className="mock-admin__answers">
        {attempt.answers.map((answer, index) => {
          const right = keyAnswers?.[index];
          const correct = right !== undefined && answer === right;
          const strokes = attempt.keystrokes.filter(stroke => stroke.q === index);
          const diagnostics = !correct && strokes.length
            ? analyzeKeystrokes(strokes.map(stroke => ({ key: stroke.key, display: stroke.display, timestamp: stroke.t, registers: stroke.registers })))
            : [];
          return (
            <li key={index} className={right === undefined ? "" : correct ? "is-right" : "is-wrong"}>
              <strong>Q{index + 1}</strong> chose {optionLetter(answer)}{right !== undefined && ` · key ${optionLetter(right)}`}
              {attempt.flags[index] && " · flagged"}
              {!correct && strokes.length > 0 && (
                <details>
                  <summary>{strokes.length} calculator keystrokes</summary>
                  <code className="mock-admin__keys">{strokes.map(stroke => stroke.key).join(" ")}</code>
                  {diagnostics.map((warning, warningIndex) => <p key={warningIndex} className="mock-admin__diag">{warning.message}</p>)}
                </details>
              )}
            </li>
          );
        })}
      </ol>
      <h5>Full-screen and focus incidents</h5>
      {attempt.incidents.length === 0 ? <p>None recorded.</p> : (
        <ol className="mock-admin__incidents">
          {attempt.incidents.map((incident, index) => (
            <li key={index}>
              <span>{formatMockClock(incident.elapsedMs)} into the test</span> {incidentLabel(incident.type)}
              <small> ({new Date(incident.atClient).toLocaleTimeString()} device time)</small>
            </li>
          ))}
        </ol>
      )}
      {archived.length > 0 && (
        <>
          <h5><History size={14} />Previous attempts</h5>
          <ul>
            {archived.sort((a, b) => a.attemptNumber - b.attemptNumber).map(entry => (
              <li key={entry.attemptNumber}>
                Attempt {entry.attemptNumber}: {entry.score !== null ? `${entry.score}/${MOCK_QUESTION_COUNT}` : "not graded"}, {entry.finishReason ? FINISH[entry.finishReason] : "unfinished"}, {entry.incidents.length} incidents · reset {new Date(entry.archivedAtMs).toLocaleString()}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
