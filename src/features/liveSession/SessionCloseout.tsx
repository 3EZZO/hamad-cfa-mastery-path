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
import {
  flattenSessionDecks,
  latestEvidenceByTarget,
} from "./sessionDeckModel";
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
  mode?: "live" | "rehearsal";
  session: LiveSessionDescriptor;
  route: LiveSessionRoute;
  stages: LiveSessionStage[];
  evidence: LiveSessionEvidence[];
  completedDeskIds?: string[];
  syncState?: "synced" | "saving" | "offline" | "error";
  actualMinutes: number;
  onBack: () => void;
  onSubmit: (result: LiveSessionCloseoutResult) => void | Promise<void>;
}

export function inferMastery(
  stage: LiveSessionStage,
  evidence: LiveSessionEvidence[],
): MasteryDecision {
  const targetIds = new Set(
    (stage.questions ?? []).filter(item => item.kind === "question").map(item => item.id),
  );
  const entries = [
    ...latestEvidenceByTarget(
      evidence.filter(
        item => item.stageId === stage.id && targetIds.has(item.targetId),
      ),
    ).values(),
  ];
  if (!entries.length || entries.some(item => item.verdict === "parked")) return "red";
  if (entries.some(item => item.verdict === "repair" || item.verdict === "partial")) return "amber";
  const targetCount = targetIds.size;
  const cleanTargets = new Set(
    entries.filter(item => item.verdict === "correct").map(item => item.targetId),
  ).size;
  return cleanTargets >= targetCount ? "green" : "amber";
}

export function SessionCloseout({
  mode = "live",
  session,
  route,
  stages,
  evidence,
  completedDeskIds = [],
  syncState = "synced",
  actualMinutes,
  onBack,
  onSubmit,
}: SessionCloseoutProps) {
  const inferred = useMemo<StageMasteryDecision[]>(
    () =>
      stages
        .filter(stage =>
          (stage.questions ?? []).some(item => item.kind === "question"),
        )
        .map(stage => ({
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
  const [openItemsAcknowledged, setOpenItemsAcknowledged] = useState(false);
  const targetIds = useMemo(
    () =>
      new Set(
        stages.flatMap(stage =>
          (stage.questions ?? [])
            .filter(item => item.kind === "question")
            .map(item => item.id),
        ),
      ),
    [stages],
  );
  const proofEvidence = [
    ...latestEvidenceByTarget(
      evidence.filter(item => targetIds.has(item.targetId)),
    ).values(),
  ];
  const correct = proofEvidence.filter(item => item.verdict === "correct").length;
  const partial = proofEvidence.filter(item => item.verdict === "partial").length;
  const repairs = proofEvidence.filter(item => item.verdict === "repair").length;
  const parked = proofEvidence.filter(item => item.verdict === "parked").length;
  const routeDecks = useMemo(() => flattenSessionDecks(stages), [stages]);
  const coveredKeys = new Set(completedDeskIds);
  const assessedTargets = new Set(proofEvidence.map(item => item.targetId));
  const coveredDecks = routeDecks.filter(
    deck => coveredKeys.has(deck.key) || assessedTargets.has(deck.targetId)
  ).length;
  const openDecks = Math.max(0, routeDecks.length - coveredDecks);
  const unresolvedItems = partial + repairs + parked + openDecks;
  const hasUnresolvedItems = unresolvedItems > 0;
  const requiresAcknowledgement = mode === "live" && unresolvedItems > 0;

  const changeDecision = (stageId: string, decision: MasteryDecision) => {
    setMastery(current =>
      current.map(item => (item.stageId === stageId ? { ...item, decision } : item)),
    );
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (requiresAcknowledgement && !openItemsAcknowledged) return;
    setSaving(true);
    try {
      await onSubmit({
        sessionId: session.id,
        routeId: route.id,
        actualMinutes,
        evidence: proofEvidence,
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
          <ArrowLeft size={17} /> {mode === "rehearsal" ? "Return to rehearsal" : "Return to session"}
        </button>
        <div>
          <p className="ls-eyebrow">Evidence before completion</p>
          <h1 id="ls-closeout-title">{mode === "rehearsal" ? "Close rehearsal" : "Close Session"} {String(session.number).padStart(2, "0")}</h1>
          <p>{mode === "rehearsal" ? "Practice reviewing the evidence. These decisions will not be saved." : "Review the evidence once. The tracker records the final decisions."}</p>
        </div>
        <span className="ls-closeout__private"><ShieldCheck size={17} /> Tutor view</span>
      </header>

      <section className="ls-closeout__metrics" aria-label="Session evidence summary">
        <article><Clock3 size={18} /><span><strong>{actualMinutes}</strong><small>actual minutes</small></span></article>
        <article className="is-positive"><Check size={18} /><span><strong>{correct}</strong><small>secure proofs</small></span></article>
        <article className="is-partial"><CircleAlert size={18} /><span><strong>{partial}</strong><small>developing proofs</small></span></article>
        <article className="is-warning"><CircleAlert size={18} /><span><strong>{repairs}</strong><small>repairs</small></span></article>
        <article className="is-danger"><ClipboardCheck size={18} /><span><strong>{parked}</strong><small>deferred</small></span></article>
      </section>

      <section className={`ls-closeout__readiness${hasUnresolvedItems ? " has-open-items" : " is-ready"}`} aria-label="Completion readiness">
        <div>
          <strong>{coveredDecks} of {routeDecks.length} route decks covered</strong>
          <span className="ls-closeout__readiness-detail">
            {openDecks} open, {repairs} repair, {parked} deferred; cloud {syncState}
          </span>
        </div>
        {requiresAcknowledgement ? (
          <label>
            <input
              type="checkbox"
              checked={openItemsAcknowledged}
              onChange={event => setOpenItemsAcknowledged(event.target.checked)}
            />
            I reviewed the open and unresolved items and intentionally want to close this session.
          </label>
        ) : hasUnresolvedItems ? (
          <p>Rehearsal closeout remains available so you can practise the complete workflow.</p>
        ) : (
          <p className="ls-closeout__ready"><Check size={17} /> Completion checks are clear.</p>
        )}
        {syncState !== "synced" && (
          <p className="ls-closeout__warning" role="status">
            The device recovery copy remains available. Keep this page open until cloud status returns to Synced when possible.
          </p>
        )}
      </section>

      <section className="ls-closeout__section">
        <div className="ls-section-heading">
          <span>1</span>
          <div><h2>Mastery decisions</h2><p>Automatic suggestions are editable. Decide from independent evidence only.</p></div>
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
                    {{ green: "Secure", amber: "Developing", red: "Rebuild" }[decision]}
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
          <div><h2>{mode === "rehearsal" ? "Practice session record" : "Shared session record"}</h2><p>{mode === "rehearsal" ? "These practice fields stay in memory and are discarded on exit." : "These fields can flow directly into Session Notes and the weekly plan."}</p></div>
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
            <span>Private tutor note <small>{mode === "rehearsal" ? "practice only — not saved" : "never shown to Hamad"}</small></span>
            <input maxLength={500} value={privateTutorNote} onChange={event => setPrivateTutorNote(event.target.value)} placeholder="Optional coaching observation" />
          </label>
        </div>
      </section>

      <footer className="ls-closeout__footer">
        <div><Save size={18} /><span><strong>{mode === "rehearsal" ? "Practice only" : "One clean save"}</strong><small>{mode === "rehearsal" ? "No evidence, progress or notes will be saved." : "Evidence, mastery, mistakes, and next actions remain synchronized."}</small></span></div>
        <button className="ls-button ls-button--primary ls-button--large" type="submit" disabled={saving || (requiresAcknowledgement && !openItemsAcknowledged)}>
          <Check size={18} /> {mode === "rehearsal" ? "Finish rehearsal without saving" : saving ? "Saving session…" : "Save and finish"}
        </button>
      </footer>
    </form>
  );
}
