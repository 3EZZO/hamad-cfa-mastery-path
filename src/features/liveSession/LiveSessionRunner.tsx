import {
  ArrowLeft,
  ArrowRight,
  BookOpenCheck,
  CheckCircle2,
  CircleAlert,
  Cloud,
  CloudOff,
  Command,
  Flag,
  MonitorUp,
  Pause,
  Play,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CandidatePromptView } from "./CandidatePromptView";
import { EvidenceRepairFlow } from "./EvidenceRepairFlow";
import { MasteryRadar } from "./MasteryRadar";
import { ReferenceDrawer } from "./ReferenceDrawer";
import { StageCard } from "./StageCard";
import type { SessionTimerController } from "./useSessionTimer";
import { formatSessionTime } from "./useSessionTimer";
import type {
  EvidenceDraft,
  EvidenceVerdict,
  LiveSessionDescriptor,
  LiveSessionEvidence,
  LiveSessionQuestion,
  LiveSessionReference,
  LiveSessionRoute,
  LiveSessionStage,
  SyncPresentation,
} from "./types";

export interface LiveSessionRunnerProps {
  session: LiveSessionDescriptor;
  route: LiveSessionRoute;
  stages: LiveSessionStage[];
  references: LiveSessionReference[];
  timer: SessionTimerController;
  evidence: LiveSessionEvidence[];
  initialStageIndex?: number;
  initialQuestionIndex?: number;
  syncState?: SyncPresentation;
  syncMessage?: string;
  onEvidence: (entry: LiveSessionEvidence) => void;
  onPositionChange?: (stageIndex: number, questionIndex: number) => void;
  onRequestCloseout: () => void;
  onExit?: () => void;
}

type ResultFilter = "all" | "open" | EvidenceVerdict;

interface CommandDeskResult {
  key: string;
  stageIndex: number;
  questionIndex: number;
  stage: LiveSessionStage;
  question?: LiveSessionQuestion;
  verdict?: EvidenceVerdict;
  searchable: string;
}

const EMPTY_DRAFT: EvidenceDraft = {
  verdict: null,
  confidence: 3,
  errorCodes: [],
  note: "",
};

function makeEvidenceId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `evidence-${crypto.randomUUID()}`;
  }
  return `evidence-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function isInteractiveTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return Boolean(
    target.closest(
      "input, textarea, select, button, a, [contenteditable='true'], [role='dialog']",
    ),
  );
}

function syncCopy(state: SyncPresentation): { label: string; icon: typeof Cloud } {
  if (state === "offline") return { label: "Offline ready", icon: CloudOff };
  if (state === "error") return { label: "Sync issue", icon: CircleAlert };
  if (state === "saving") return { label: "Saving", icon: Cloud };
  return { label: "Synced", icon: CheckCircle2 };
}

function latestEvidenceMap(evidence: LiveSessionEvidence[]): Map<string, LiveSessionEvidence> {
  const result = new Map<string, LiveSessionEvidence>();
  evidence.forEach(entry => result.set(entry.targetId, entry));
  return result;
}

function resultLabel(result: CommandDeskResult): string {
  return result.question?.title || result.question?.label || result.stage.title;
}

function isEvidenceTarget(question?: LiveSessionQuestion): boolean {
  return question?.kind === "question";
}

const REFERENCE_STOP_WORDS = new Set([
  "about", "after", "answer", "before", "calculate", "explain", "from",
  "hamad", "into", "method", "question", "return", "stage", "that",
  "their", "this", "what", "when", "which", "with", "your",
]);

function referenceTokens(value: string): string[] {
  return [...new Set(
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .split(/\s+/)
      .filter(token => token.length >= 4 && !REFERENCE_STOP_WORDS.has(token)),
  )];
}

export function LiveSessionRunner({
  session,
  route,
  stages,
  references,
  timer,
  evidence,
  initialStageIndex = 0,
  initialQuestionIndex = 0,
  syncState = "synced",
  syncMessage,
  onEvidence,
  onPositionChange,
  onRequestCloseout,
  onExit,
}: LiveSessionRunnerProps) {
  const safeInitialStage = Math.min(
    Math.max(0, initialStageIndex),
    Math.max(0, stages.length - 1),
  );
  const [stageIndex, setStageIndex] = useState(safeInitialStage);
  const [questionIndex, setQuestionIndex] = useState(Math.max(0, initialQuestionIndex));
  const [draft, setDraft] = useState<EvidenceDraft>(EMPTY_DRAFT);
  const [candidateOpen, setCandidateOpen] = useState(false);
  const [referenceOpen, setReferenceOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [resultFilter, setResultFilter] = useState<ResultFilter>("all");
  const searchRef = useRef<HTMLInputElement>(null);

  const stage = stages[stageIndex] ?? stages[0];
  const questions = stage?.questions ?? [];
  const safeQuestionIndex = Math.min(questionIndex, Math.max(0, questions.length - 1));
  const question = questions[safeQuestionIndex];
  const evidenceTarget = isEvidenceTarget(question);
  const targetId = question?.id ?? stage?.id ?? "unknown";
  const targetLabel = question
    ? `${question.label ?? `Proof ${safeQuestionIndex + 1}`} · ${question.id}`
    : stage?.title ?? "Stage evidence";
  const stageTargetIds = new Set(
    questions.filter(isEvidenceTarget).map(item => item.id),
  );
  const currentEvidence = evidence.filter(
    item => item.stageId === stage?.id && stageTargetIds.has(item.targetId),
  );
  const allQuestions = questions.length || 1;
  const stageEvidenceCount = new Set(currentEvidence.map(item => item.targetId)).size;
  const stageTargetCount = stageTargetIds.size;
  const SyncIcon = syncCopy(syncState).icon;

  useEffect(() => {
    if (questionIndex !== safeQuestionIndex) setQuestionIndex(safeQuestionIndex);
  }, [questionIndex, safeQuestionIndex]);

  useEffect(() => {
    onPositionChange?.(stageIndex, safeQuestionIndex);
  }, [onPositionChange, safeQuestionIndex, stageIndex]);

  const changePosition = useCallback(
    (nextStage: number, nextQuestion: number) => {
      setStageIndex(Math.min(Math.max(0, nextStage), Math.max(0, stages.length - 1)));
      setQuestionIndex(Math.max(0, nextQuestion));
      setDraft(EMPTY_DRAFT);
      window.scrollTo({ top: 0, behavior: "auto" });
    },
    [stages.length],
  );

  const goNext = useCallback(() => {
    if (!stage) return;
    if (safeQuestionIndex + 1 < questions.length) {
      changePosition(stageIndex, safeQuestionIndex + 1);
      return;
    }
    if (stageIndex + 1 < stages.length) {
      changePosition(stageIndex + 1, 0);
      return;
    }
    onRequestCloseout();
  }, [
    changePosition,
    onRequestCloseout,
    questions.length,
    safeQuestionIndex,
    stage,
    stageIndex,
    stages.length,
  ]);

  const goPrevious = useCallback(() => {
    if (safeQuestionIndex > 0) {
      changePosition(stageIndex, safeQuestionIndex - 1);
      return;
    }
    if (stageIndex <= 0) return;
    const previousStage = stages[stageIndex - 1];
    changePosition(stageIndex - 1, Math.max(0, (previousStage?.questions?.length ?? 1) - 1));
  }, [changePosition, safeQuestionIndex, stageIndex, stages]);

  const recordEvidence = useCallback(() => {
    if (!stage || !evidenceTarget || !draft.verdict) return;
    if (draft.verdict === "repair" && !draft.errorCodes.length) return;
    onEvidence({
      id: makeEvidenceId(),
      stageId: stage.id,
      targetId,
      targetLabel,
      verdict: draft.verdict,
      confidence: draft.confidence,
      errorCodes: draft.verdict === "repair" ? draft.errorCodes : [],
      note: draft.note.trim(),
      recordedAt: new Date().toISOString(),
    });
    setDraft(EMPTY_DRAFT);
    goNext();
  }, [draft, evidenceTarget, goNext, onEvidence, stage, targetId, targetLabel]);

  const selectVerdict = useCallback((verdict: EvidenceVerdict) => {
    if (!evidenceTarget) return;
    setDraft(current => ({
      ...current,
      verdict,
      errorCodes: verdict === "repair" ? current.errorCodes : [],
    }));
  }, [evidenceTarget]);

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if (event.key === "/" && !isInteractiveTarget(event.target)) {
        event.preventDefault();
        searchRef.current?.focus();
        return;
      }
      if (isInteractiveTarget(event.target)) return;
      const key = event.key.toLowerCase();
      if (key === " ") {
        event.preventDefault();
        timer.toggle();
      } else if (key === "v") {
        event.preventDefault();
        setCandidateOpen(true);
      } else if (key === "f") {
        event.preventDefault();
        setReferenceOpen(true);
      } else if (key === "c") {
        event.preventDefault();
        selectVerdict("correct");
      } else if (key === "l") {
        event.preventDefault();
        selectVerdict("partial");
      } else if (key === "r") {
        event.preventDefault();
        selectVerdict("repair");
      } else if (key === "p") {
        event.preventDefault();
        selectVerdict("parked");
      } else if (key === "n") {
        event.preventDefault();
        goNext();
      } else if (key === "b") {
        event.preventDefault();
        goPrevious();
      } else if (key === "enter" && draft.verdict) {
        event.preventDefault();
        recordEvidence();
      } else if (key === "?") {
        event.preventDefault();
        setShortcutsOpen(value => !value);
      }
    };
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, [draft.verdict, goNext, goPrevious, recordEvidence, selectVerdict, timer]);

  const latestEvidence = useMemo(() => latestEvidenceMap(evidence), [evidence]);
  const commandDeskResults = useMemo<CommandDeskResult[]>(() => {
    return stages.flatMap((item, itemStageIndex) => {
      const stageQuestions = item.questions?.length ? item.questions : [undefined];
      return stageQuestions.map((itemQuestion, itemQuestionIndex) => {
        const itemTargetId = itemQuestion?.id ?? item.id;
        const verdict = latestEvidence.get(itemTargetId)?.verdict;
        return {
          key: `${item.id}-${itemTargetId}`,
          stageIndex: itemStageIndex,
          questionIndex: itemQuestionIndex,
          stage: item,
          question: itemQuestion,
          verdict,
          searchable: [
            item.label,
            item.title,
            item.objective,
            itemQuestion?.id,
            itemQuestion?.title,
            itemQuestion?.concept,
            itemQuestion?.explanation,
            itemQuestion?.prompt,
            itemQuestion?.answer,
            itemQuestion?.spokenAnswer,
            itemQuestion?.rationale,
            ...(itemQuestion?.tags ?? []),
          ].filter(Boolean).join(" ").toLowerCase(),
        };
      });
    });
  }, [latestEvidence, stages]);

  const filteredResults = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return commandDeskResults.filter(result => {
      const searchMatch = !normalized || result.searchable.includes(normalized);
      const filterMatch = resultFilter === "all"
        ? true
        : resultFilter === "open"
          ? isEvidenceTarget(result.question) && !result.verdict
          : isEvidenceTarget(result.question) && result.verdict === resultFilter;
      return searchMatch && filterMatch;
    });
  }, [commandDeskResults, query, resultFilter]);

  const showSearchResults = Boolean(query.trim()) || resultFilter !== "all";
  const evidenceTargetIds = useMemo(
    () =>
      new Set(
        commandDeskResults
          .filter(result => isEvidenceTarget(result.question))
          .map(result => result.question!.id),
      ),
    [commandDeskResults],
  );
  const targetEvidence = useMemo(
    () => evidence.filter(entry => evidenceTargetIds.has(entry.targetId)),
    [evidence, evidenceTargetIds],
  );
  const activeReferenceIds = useMemo(() => {
    const tokens = referenceTokens(
      [
        stage?.title,
        stage?.objective,
        question?.title,
        question?.concept,
        question?.prompt,
        ...(question?.tags ?? []),
      ]
        .filter(Boolean)
        .join(" "),
    );
    return references
      .map(reference => {
        const searchable = [
          reference.title,
          reference.category,
          reference.summary ?? "",
          ...(reference.tags ?? []),
        ]
          .join(" ")
          .toLowerCase();
        return {
          id: reference.id,
          score: tokens.reduce(
            (total, token) => total + (searchable.includes(token) ? 1 : 0),
            0,
          ),
        };
      })
      .filter(item => item.score >= 2)
      .sort((left, right) => right.score - left.score)
      .slice(0, 3)
      .map(item => item.id);
  }, [question, references, stage]);
  const stageProgress = useMemo(
    () =>
      stages.map(item => {
        const targetIds = new Set(
          (item.questions ?? []).filter(isEvidenceTarget).map(card => card.id),
        );
        return {
          ...item,
          evidenceCount: new Set(
            evidence
              .filter(
                entry => entry.stageId === item.id && targetIds.has(entry.targetId),
              )
              .map(entry => entry.targetId),
          ).size,
          targetCount: targetIds.size,
        };
      }),
    [evidence, stages],
  );
  const plannedBeforeMs = stages
    .slice(0, stageIndex)
    .reduce((total, item) => total + item.durationMinutes * 60_000, 0);
  const stageElapsedMs = Math.max(0, timer.elapsedMs - plannedBeforeMs);
  const stageDurationMs = Math.max(1, stage?.durationMinutes ?? 1) * 60_000;
  const stageOvertime = stageElapsedMs > stageDurationMs;
  const stageDisplay = stageOvertime
    ? `+${formatSessionTime(stageElapsedMs - stageDurationMs)}`
    : formatSessionTime(stageDurationMs - stageElapsedMs);

  if (!stage) {
    return (
      <section className="ls-state ls-state--empty">
        <CircleAlert size={30} />
        <p className="ls-eyebrow">Nothing to run</p>
        <h2>This route has no teaching stages</h2>
        <p>Choose a different route or republish the private playbook package.</p>
        {onExit && <button className="ls-button ls-button--primary" type="button" onClick={onExit}>Return to tracker</button>}
      </section>
    );
  }

  return (
    <section className="ls-runner" aria-label={`Live ${session.title}`}>
      <header className="ls-livebar">
        <div className="ls-livebar__identity">
          <span className="ls-live-dot" aria-hidden="true" />
          <div>
            <span>Session {String(session.number).padStart(2, "0")} · {route.name}</span>
            <strong>{stage.title}</strong>
          </div>
        </div>
        <MasteryRadar evidence={targetEvidence} total={evidenceTargetIds.size} />
        <div className="ls-clock-cluster" aria-label="Session timers">
          <div className={`ls-clock${timer.expired ? " is-overtime" : ""}`}>
            <span>{timer.expired ? "Session overtime" : "Session left"}</span>
            <time>{timer.display}</time>
          </div>
          <div className={`ls-clock${stageOvertime ? " is-overtime" : ""}`}>
            <span>{stageOvertime ? "Stage overtime" : "Stage left"}</span>
            <time>{stageDisplay}</time>
          </div>
          <button
            className="ls-timer-toggle"
            type="button"
            disabled={timer.status === "complete"}
            onClick={timer.toggle}
            aria-label={timer.status === "running" ? "Pause both timers" : "Resume both timers"}
          >
            {timer.status === "running" ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" />}
          </button>
        </div>
        <div className="ls-livebar__actions">
          <span className={`ls-sync ls-sync--${syncState}`} title={syncMessage}>
            <SyncIcon size={15} /> {syncCopy(syncState).label}
          </span>
          <button className="ls-icon-button" type="button" onClick={() => setShortcutsOpen(value => !value)} aria-label="Show keyboard shortcuts">
            <Command size={19} />
          </button>
          <button className="ls-button ls-button--quiet" type="button" onClick={onRequestCloseout}>
            <Flag size={16} /> Complete
          </button>
        </div>
      </header>

      <nav className="ls-stage-strip" aria-label="Session stages">
        <div className="ls-stage-strip__progress">
          <span>Stage {stageIndex + 1} of {stages.length}</span>
          <strong>{stage.label}</strong>
        </div>
        <div className="ls-stage-strip__items">
          {stageProgress.map((item, index) => {
            const complete = item.targetCount
              ? item.evidenceCount >= item.targetCount
              : index < stageIndex;
            return (
              <button
                type="button"
                className={`${index === stageIndex ? "is-current" : ""}${complete ? " is-complete" : ""}`}
                aria-current={index === stageIndex ? "step" : undefined}
                title={`${item.label}: ${item.title}`}
                key={item.id}
                onClick={() => changePosition(index, 0)}
              >
                {complete ? <CheckCircle2 size={15} /> : <span>{index + 1}</span>}
              </button>
            );
          })}
        </div>
        <button className="ls-button ls-button--quiet" type="button" onClick={() => setReferenceOpen(true)}>
          <BookOpenCheck size={16} /> Knowledge desk <kbd>F</kbd>
        </button>
      </nav>

      <section className="ls-command-search" aria-label="Find any playbook item">
        <label>
          <Search size={18} />
          <span className="ls-sr-only">Search the private playbook</span>
          <input
            ref={searchRef}
            type="search"
            value={query}
            placeholder="Find a concept, formula, question, or model response"
            onChange={event => setQuery(event.target.value)}
          />
          {query ? <button type="button" onClick={() => setQuery("")} aria-label="Clear search"><X size={16} /></button> : <kbd>/</kbd>}
        </label>
        <label className="ls-filter-control">
          <SlidersHorizontal size={17} />
          <span className="ls-sr-only">Filter by evidence result</span>
          <select value={resultFilter} onChange={event => setResultFilter(event.target.value as ResultFilter)}>
            <option value="all">All route desks</option>
            <option value="open">Proof not recorded</option>
            <option value="correct">Secure</option>
            <option value="partial">Developing</option>
            <option value="repair">Needs repair</option>
            <option value="parked">Deferred</option>
          </select>
        </label>
      </section>

      {showSearchResults && (
        <section className="ls-search-results" aria-live="polite" aria-label="Playbook search results">
          <header>
            <div><strong>{filteredResults.length} matches</strong><span>Ordered by teaching route</span></div>
            <button type="button" onClick={() => { setQuery(""); setResultFilter("all"); }}>Clear</button>
          </header>
          {filteredResults.length ? (
            <div className="ls-search-results__list">
              {filteredResults.map(result => (
                <button
                  type="button"
                  key={result.key}
                  onClick={() => {
                    changePosition(result.stageIndex, result.questionIndex);
                    setQuery("");
                    setResultFilter("all");
                  }}
                >
                  <span>{result.stage.label} · {result.question?.label ?? "Stage"}</span>
                  <strong>{resultLabel(result)}</strong>
                  <small>{result.question?.prompt ?? result.stage.objective}</small>
                  <em className={result.verdict ? `is-${result.verdict}` : "is-open"}>{result.verdict ?? "open"}</em>
                </button>
              ))}
            </div>
          ) : (
            <div className="ls-no-results">
              <Search size={23} />
              <strong>No teaching desk matches</strong>
              <p>Try fewer words, a formula fragment, or clear the proof filter.</p>
            </div>
          )}
        </section>
      )}

      {shortcutsOpen && (
        <div className="ls-shortcuts" role="status">
          <span><kbd>/</kbd> search</span><span><kbd>Space</kbd> timers</span>
          <span><kbd>V</kbd> candidate</span><span><kbd>C</kbd> correct</span>
          <span><kbd>L</kbd> developing</span><span><kbd>R</kbd> repair</span>
          <span><kbd>P</kbd> defer</span><span><kbd>B</kbd> back</span><span><kbd>N</kbd> next</span>
          <button type="button" onClick={() => setShortcutsOpen(false)} aria-label="Hide shortcuts"><X size={15} /></button>
        </div>
      )}

      <div className="ls-runner__grid">
        <main className="ls-runner__main">
          <div className="ls-proof-progress">
            <span>Teaching desk {safeQuestionIndex + 1} of {allQuestions}</span>
            <span>
              {stageTargetCount
                ? `${stageEvidenceCount} of ${stageTargetCount} mastery proofs recorded`
                : "Teaching stage · no formal proof required"}
            </span>
          </div>
          <StageCard
            stage={stage}
            question={question}
            questionIndex={safeQuestionIndex}
            onShowCandidate={() => setCandidateOpen(true)}
          />
          <nav className="ls-page-controls" aria-label="Command desk navigation">
            <button className="ls-button ls-button--quiet" type="button" disabled={stageIndex === 0 && safeQuestionIndex === 0} onClick={goPrevious}>
              <ArrowLeft size={17} /> Previous <kbd>B</kbd>
            </button>
            <button className="ls-button ls-button--candidate" type="button" onClick={() => setCandidateOpen(true)}>
              <MonitorUp size={17} /> Candidate view <kbd>V</kbd>
            </button>
            <button className="ls-button ls-button--quiet" type="button" onClick={goNext}>
              {stageIndex === stages.length - 1 && safeQuestionIndex === allQuestions - 1 ? "Closeout" : "Next"}
              <ArrowRight size={17} /> <kbd>N</kbd>
            </button>
          </nav>
        </main>

        {evidenceTarget ? (
          <EvidenceRepairFlow
            targetLabel={targetLabel}
            value={draft}
            repairInstructions={question?.repair?.length ? question.repair : stage.repair}
            onChange={setDraft}
            onRecord={recordEvidence}
          />
        ) : (
          <aside className="ls-evidence ls-evidence--teaching" aria-label="Teaching move">
            <header className="ls-evidence__header">
              <div>
                <p className="ls-eyebrow">Teaching move</p>
                <h2>Build the mental model</h2>
              </div>
              <BookOpenCheck size={20} aria-hidden="true" />
            </header>
            <p className="ls-evidence__target">No mastery verdict is required on this desk.</p>
            <ol className="ls-teaching-move-list">
              <li>Explain the core idea in your own natural voice.</li>
              <li>Ask the displayed check and wait for Hamad to commit.</li>
              <li>Use the model response to sharpen the explanation.</li>
              <li>Move forward to the next independent proof.</li>
            </ol>
            <button className="ls-button ls-button--primary ls-button--block" type="button" onClick={goNext}>
              Continue to next desk <ArrowRight size={17} /> <kbd>N</kbd>
            </button>
          </aside>
        )}
      </div>

      <CandidatePromptView
        open={candidateOpen}
        sessionLabel={`Session ${String(session.number).padStart(2, "0")}`}
        stageLabel={stage.title}
        prompt={question?.prompt ?? stage.ask?.[0] ?? stage.objective}
        options={question?.options}
        timeDisplay={timer.display}
        onClose={() => setCandidateOpen(false)}
      />
      <ReferenceDrawer
        open={referenceOpen}
        references={references}
        activeReferenceIds={stage.referenceIds?.length ? stage.referenceIds : activeReferenceIds}
        onClose={() => setReferenceOpen(false)}
      />
    </section>
  );
}
