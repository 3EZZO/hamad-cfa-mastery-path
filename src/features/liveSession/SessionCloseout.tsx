import {
  ArrowLeft,
  Check,
  CircleAlert,
  ClipboardCheck,
  Clock3,
  Save,
  ShieldCheck,
} from "lucide-react";
import { type FormEvent, useMemo, useState } from "react";
import type {
  LiveSessionCloseoutResult,
  LiveSessionDescriptor,
  LiveSessionEvidence,
  LiveSessionRoute,
  LiveSessionStage,
  MasteryDecision,
  StageMasteryDecision,
} from "./types";

export interface SessionCloseoutProps {
  session: LiveSessionDescriptor;
  route: LiveSessionRoute;
  stages: LiveSessionStage[];
  evidence: LiveSessionEvidence[];
  actualMinutes: number;
  onBack: () => void;
  onSubmit: (result: LiveSessionCloseoutResult) => void | Promise<void>;
}

function inferMastery(
  stage: LiveSessionStage,
  evidence: LiveSessionEvidence[],
): MasteryDecision {
  const entries = evidence.filter(item => item.stageId === stage.id);
  if (!entries.length || entries.some(item => item.verdict === "parked")) return "red";
  if (entries.some(item => item.verdict === "repair" || item.verdict === "partial")) return "amber";
  const targetCount = stage.questions?.length || 1;
  const cleanTargets = new Set(
    entries.filter(item => item.verdict === "correct").map(item => item.targetId),
  ).size;
  return cleanTargets >= targetCount ? "green" : "amber";
}

export function SessionCloseout({
  session,
  route,
  stages,
  evidence,
  actualMinutes,
  onBack,
  onSubmit,
}: SessionCloseoutProps) {
  const inferred = useMemo<StageMasteryDecision[]>(
    () =>
      stages.map(stage => ({
        stageId: stage.id,
        stageTitle: stage.title,
        decision: inferMastery(stage, evidence),
      })),
    [evidence, stages],
  );
  const [mastery, setMastery] = useState(inferred);
  const [outcome, setOutcome] = useState("");
  const [nextAction, setNextAction] = useState("");
  const [homework, setHomework] = useState("");
  const [delayedRetest, setDelayedRetest] = useState("");
  const [privateTutorNote, setPrivateTutorNote] = useState("");
  const [saving, setSaving] = useState(false);
  const correct = evidence.filter(item => item.verdict === "correct").length;
  const partial = evidence.filter(item => item.verdict === "partial").length;
  const repairs = evidence.filter(item => item.verdict === "repair").length;
  const parked = evidence.filter(item => item.verdict === "parked").length;

  const changeDecision = (stageId: string, decision: MasteryDecision) => {
    setMastery(current =>
      current.map(item => (item.stageId === stageId ? { ...item, decision } : item)),
    );
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      await onSubmit({
        sessionId: session.id,
        routeId: route.id,
        actualMinutes,
        evidence,
        mastery,
        outcome: outcome.trim(),
        nextAction: nextAction.trim(),
        homework: homework.trim(),
        delayedRetest: delayedRetest.trim(),
        privateTutorNote: privateTutorNote.trim(),
        completedAt: new Date().toISOString(),
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className="ls-closeout" onSubmit={submit} aria-labelledby="ls-closeout-title">
      <header className="ls-closeout__header">
        <button className="ls-button ls-button--quiet" type="button" onClick={onBack}>
          <ArrowLeft size={17} /> Return to session
        </button>
        <div>
          <p className="ls-eyebrow">Evidence before completion</p>
          <h1 id="ls-closeout-title">Close Session {String(session.number).padStart(2, "0")}</h1>
          <p>Review the evidence once. The tracker records the final decisions.</p>
        </div>
        <span className="ls-closeout__private"><ShieldCheck size={17} /> Tutor view</span>
      </header>

      <section className="ls-closeout__metrics" aria-label="Session evidence summary">
        <article><Clock3 size={18} /><span><strong>{actualMinutes}</strong><small>actual minutes</small></span></article>
        <article className="is-positive"><Check size={18} /><span><strong>{correct}</strong><small>clean proofs</small></span></article>
        <article className="is-partial"><CircleAlert size={18} /><span><strong>{partial}</strong><small>partial proofs</small></span></article>
        <article className="is-warning"><CircleAlert size={18} /><span><strong>{repairs}</strong><small>repairs</small></span></article>
        <article className="is-danger"><ClipboardCheck size={18} /><span><strong>{parked}</strong><small>parked</small></span></article>
      </section>

      <section className="ls-closeout__section">
        <div className="ls-section-heading">
          <span>1</span>
          <div><h2>Mastery decisions</h2><p>Automatic suggestions are editable. Use only observed evidence.</p></div>
        </div>
        <div className="ls-mastery-list">
          {mastery.map((item, index) => (
            <article key={item.stageId}>
              <div><span>Stage {index + 1}</span><strong>{item.stageTitle}</strong></div>
              <div className="ls-mastery-choice" role="group" aria-label={`Mastery for ${item.stageTitle}`}>
                {(["green", "amber", "red"] as MasteryDecision[]).map(decision => (
                  <button
                    type="button"
                    className={`ls-mastery-choice--${decision}${item.decision === decision ? " is-selected" : ""}`}
                    aria-pressed={item.decision === decision}
                    key={decision}
                    onClick={() => changeDecision(item.stageId, decision)}
                  >
                    {decision}
                  </button>
                ))}
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="ls-closeout__section">
        <div className="ls-section-heading">
          <span>2</span>
          <div><h2>Shared session record</h2><p>These fields can flow directly into Session Notes and the weekly plan.</p></div>
        </div>
        <div className="ls-closeout__form-grid">
          <label className="ls-field ls-field--wide">
            <span>Observable outcome</span>
            <textarea required rows={3} maxLength={800} value={outcome} onChange={event => setOutcome(event.target.value)} placeholder="What can Hamad now do without help? What remains unstable?" />
          </label>
          <label className="ls-field">
            <span>Next action</span>
            <textarea required rows={3} maxLength={500} value={nextAction} onChange={event => setNextAction(event.target.value)} placeholder="One precise action before the next checkpoint." />
          </label>
          <label className="ls-field">
            <span>Homework</span>
            <textarea required rows={3} maxLength={800} value={homework} onChange={event => setHomework(event.target.value)} placeholder="Question IDs, volume, timing, and required evidence." />
          </label>
          <label className="ls-field">
            <span>Delayed retest</span>
            <input required maxLength={300} value={delayedRetest} onChange={event => setDelayedRetest(event.target.value)} placeholder="Date, question set, and release threshold" />
          </label>
          <label className="ls-field">
            <span>Private tutor note <small>never shown to Hamad</small></span>
            <input maxLength={500} value={privateTutorNote} onChange={event => setPrivateTutorNote(event.target.value)} placeholder="Optional coaching observation" />
          </label>
        </div>
      </section>

      <footer className="ls-closeout__footer">
        <div><Save size={18} /><span><strong>One clean save</strong><small>Evidence, mastery, mistakes, and next actions remain synchronized.</small></span></div>
        <button className="ls-button ls-button--primary ls-button--large" type="submit" disabled={saving}>
          <Check size={18} /> {saving ? "Saving session…" : "Save and finish"}
        </button>
      </footer>
    </form>
  );
}
