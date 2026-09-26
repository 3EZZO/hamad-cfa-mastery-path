import { ClipboardCheck, CircleAlert, CloudUpload, Eye, EyeOff, History, RotateCcw, Unlock } from "lucide-react";
import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { useAppDialog } from "../../components/AppDialog";
import { MOCK_MODULES, mockModuleById } from "../../data/mockModules";
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
  mockAttemptId,
  mockAttemptView,
  mockTimeUsedMs,
  optionLetter,
  type MockAttempt,
  type MockAttemptHistoryEntry,
  type MockOption,
  type MockTestMeta,
} from "../../lib/mockTestContent";
import { MockAnswerKeyReview } from "./MockAnswerKeyReview";
import "./moduleMock.css";

type Notify = (message: string, tone?: "success" | "warning") => void;

const FINISH: Record<string, string> = {
  submit: "Submitted",
  timeout: "Auto-submitted at 00:00",
  expired: "Expired while away",
  leave: "Forfeited (Leave Test)",
};

export function MockTestAdmin({ notify }: { notify: Notify }) {
  const dialog = useAppDialog();
  const input = useRef<HTMLInputElement>(null);
  const [metas, setMetas] = useState<MockTestMeta[]>([]);
  const [attempts, setAttempts] = useState<MockAttempt[]>([]);
  const [history, setHistory] = useState<MockAttemptHistoryEntry[]>([]);
  const [students, setStudents] = useState<ProjectMember[]>([]);
  const [keys, setKeys] = useState<Record<string, MockOption[]>>({});
  const [reviewing, setReviewing] = useState<MockTestPackage | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
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
    } catch (cause) {
      setError(getCloudErrorMessage(cause));
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

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
      `Reset ${studentName}'s Module ${module?.number ?? ""} attempt? The current attempt is kept in the history and ${studentName} can take the test again. `
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

      <div className="mock-admin__modules">
        {MOCK_MODULES.map(module => {
          const meta = metas.find(entry => entry.moduleId === module.id);
          return (
            <article key={module.id} className="mock-admin__module">
              <div>
                <span>Module {module.number}</span>
                <strong>{module.title}</strong>
                <small>{meta ? `${meta.status === "published" ? "Published" : "Draft"} · version ${meta.version}` : "No test uploaded"}</small>
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
                </div>
              )}
            </article>
          );
        })}
      </div>

      <h4 className="mock-admin__subhead">Student results</h4>
      {students.length === 0 ? <p>No active student accounts.</p> : (
        <div className="mock-table-wrap">
          <table className="mock-table mock-admin__results">
            <thead>
              <tr><th scope="col">Student</th><th scope="col">Module</th><th scope="col">Status</th><th scope="col">Score</th><th scope="col">Time used</th><th scope="col">Incidents</th><th scope="col">Actions</th></tr>
            </thead>
            <tbody>
              {students.flatMap(student => MOCK_MODULES.map(module => {
                const attempt = attempts.find(entry => entry.id === mockAttemptId(student.uid, module.id)) ?? null;
                const view = mockAttemptView(attempt, Date.now());
                // Member records carry no names; this program has one student, Hamad.
                const name = students.length === 1 ? "Hamad" : `Student ${student.uid.slice(0, 6)}`;
                const rowKey = `${student.uid}-${module.id}`;
                const archived = history.filter(entry => entry.id === mockAttemptId(student.uid, module.id));
                return (
                  <Fragment key={rowKey}>
                    <tr>
                      <th scope="row">{name}</th>
                      <td>Module {module.number}</td>
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
              }))}
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
