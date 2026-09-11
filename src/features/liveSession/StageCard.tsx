import {
  AlertTriangle,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  Gauge,
  Lightbulb,
  MessageSquareText,
  MonitorUp,
  PenLine,
  Quote,
  Route,
  Sparkles,
} from "lucide-react";
import { useRef } from "react";
import type {
  LiveSessionQuestion,
  LiveSessionStage,
  TeachingFlowStep,
} from "./types";

export interface StageCardProps {
  stage: LiveSessionStage;
  question?: LiveSessionQuestion;
  questionIndex: number;
  flowStep: TeachingFlowStep;
  complete: boolean;
  onFlowStepChange: (step: TeachingFlowStep) => void;
  onShowCandidate?: () => void;
}

function TextList({
  items,
  ordered = false,
}: {
  items?: string[];
  ordered?: boolean;
}) {
  if (!items?.length) return null;
  const Tag = ordered ? "ol" : "ul";
  return (
    <Tag>
      {items.map((item, index) => (
        <li key={`${index}-${item}`}>{item}</li>
      ))}
    </Tag>
  );
}

function CommandBlock({
  icon,
  label,
  children,
  tone,
  active,
  sectionRef,
  onActivate,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
  tone: "explain" | "question" | "answer";
  active: boolean;
  sectionRef: React.RefObject<HTMLElement | null>;
  onActivate: () => void;
}) {
  return (
    <section
      ref={sectionRef}
      className={`ls-command-block ls-command-block--${tone}${active ? " is-active" : ""}`}
    >
      <header>
        <button
          type="button"
          className="ls-panel-step"
          aria-current={active ? "step" : undefined}
          onClick={onActivate}
        >
          <span className="ls-command-block__icon" aria-hidden="true">
            {icon}
          </span>
          <strong>{label}</strong>
          <span className="ls-panel-step__hint">
            {active
              ? "Current step"
              : tone === "explain"
                ? "Explain the concept"
                : tone === "question"
                  ? "Check understanding"
                  : "Explain the result"}
          </span>
        </button>
      </header>
      <div className="ls-command-block__body">{children}</div>
    </section>
  );
}

function bestExplanation(
  stage: LiveSessionStage,
  question?: LiveSessionQuestion
): string {
  return question?.explanation || stage.explanation || stage.objective;
}

function bestScript(
  stage: LiveSessionStage,
  question?: LiveSessionQuestion
): string[] {
  if (question?.teachingScript?.length) return question.teachingScript;
  if (stage.say?.length) return stage.say;
  return [bestExplanation(stage, question)];
}

function bestAnswer(question?: LiveSessionQuestion): string {
  return (
    question?.spokenAnswer ||
    question?.answer ||
    ""
  );
}

export function StageCard({
  stage,
  question,
  questionIndex,
  flowStep,
  complete,
  onFlowStepChange,
  onShowCandidate,
}: StageCardProps) {
  const listenFor = question?.listenFor?.length
    ? question.listenFor
    : stage.listenFor;
  const repair = question?.repair?.length ? question.repair : stage.repair;
  const write = question?.write?.length
    ? question.write
    : question?.working?.length
      ? question.working
      : stage.write;
  const teachRef = useRef<HTMLElement>(null);
  const askRef = useRef<HTMLElement>(null);
  const answerRef = useRef<HTMLElement>(null);
  const flowRefs = { teach: teachRef, ask: askRef, answer: answerRef };
  const suppliedPrompt = question?.prompt || stage.ask?.[0];
  const suppliedAnswer = bestAnswer(question);

  const moveTo = (step: TeachingFlowStep) => {
    onFlowStepChange(step);
    const reducedMotion = window.matchMedia?.(
      "(prefers-reduced-motion: reduce)"
    ).matches;
    window.setTimeout(
      () =>
        flowRefs[step].current?.scrollIntoView({
          behavior: reducedMotion ? "auto" : "smooth",
          block: window.matchMedia?.("(max-width: 899px)").matches
            ? "start"
            : "nearest",
        }),
      0
    );
  };

  return (
    <article className="ls-stage-card" aria-labelledby="ls-stage-title">
      <header className="ls-stage-card__header">
        <div className="ls-stage-card__identity">
          <p className="ls-eyebrow">{stage.label}</p>
          <h2 id="ls-stage-title">{question?.title || stage.title}</h2>
          {stage.objective && (
            <details className="ls-deck-objective">
              <summary>Teaching objective</summary>
              <p>{stage.objective}</p>
            </details>
          )}
        </div>
        <div
          className="ls-item-meta"
          aria-label="Current teaching item details"
        >
          <span>
            <Route size={15} /> Item {questionIndex + 1}
          </span>
          {question?.kind && (
            <span>
              <BookOpen size={15} /> {question.kind}
            </span>
          )}
          {question?.tier && (
            <span>
              <Route size={15} /> {question.tier}
            </span>
          )}
          {complete && (
            <span className="is-covered">
              <CheckCircle2 size={15} /> Covered
            </span>
          )}
          {question?.difficulty ? (
            <span>
              <Gauge size={15} /> Level {question.difficulty}/5
            </span>
          ) : null}
          {question?.expectedSeconds ? (
            <span>
              <Clock3 size={15} /> {Math.ceil(question.expectedSeconds / 60)}{" "}
              min
            </span>
          ) : null}
        </div>
      </header>

      <nav className="ls-panel-jumps" aria-label="Jump to teaching panel">
        {(["teach", "ask", "answer"] as TeachingFlowStep[]).map(step => <button key={step} type="button" aria-pressed={flowStep === step} onClick={() => moveTo(step)}>{step === "teach" ? "Teach" : step === "ask" ? "Ask" : "Answer"}</button>)}
      </nav>
      <div className="ls-command-grid" aria-label="Tutor command desk">
        <CommandBlock
          icon={<Lightbulb size={19} />}
          label="1 · Teach"
          tone="explain"
          active={flowStep === "teach"}
          sectionRef={teachRef}
          onActivate={() => moveTo("teach")}
        >
          <p className="ls-command-lead">{bestExplanation(stage, question)}</p>
          <div className="ls-script-ribbon">
            <span>
              <Quote size={15} /> Teach it
            </span>
            <TextList
              items={bestScript(stage, question)}
              ordered={bestScript(stage, question).length > 1}
            />
          </div>
          {question?.depthNotes ? (
            <div className="ls-depth-note">
              <span>Teaching depth</span>
              <p>{question.depthNotes}</p>
            </div>
          ) : null}
          {question?.formulae?.length ? (
            <div className="ls-formula-stack">
              <span>Formula desk</span>
              {question.formulae.map(formula => (
                <code key={formula}>{formula}</code>
              ))}
            </div>
          ) : null}
          {write?.length ? (
            <div className="ls-board-cue">
              <span>
                <PenLine size={15} /> Write or draw
              </span>
              <TextList items={write} ordered />
            </div>
          ) : null}
        </CommandBlock>

        <CommandBlock
          icon={<MessageSquareText size={19} />}
          label="2 · Ask"
          tone="question"
          active={flowStep === "ask"}
          sectionRef={askRef}
          onActivate={() => moveTo("ask")}
        >
          <div className="ls-question-copy">
            <div className="ls-question-copy__topline">
              <span>{question?.label ?? `${question?.kind === "question" ? "Assessment proof" : "Teaching check"} ${questionIndex + 1}`}</span>
              {question?.id && <code>{question.id}</code>}
            </div>
            {suppliedPrompt && <h3>{suppliedPrompt}</h3>}
            {question?.options?.length ? (
              <ol className="ls-question-options">
                {question.options.map((option, index) => (
                  <li key={`${index}-${option}`}>
                    <span>{String.fromCharCode(65 + index)}</span>
                    <p>{option}</p>
                  </li>
                ))}
              </ol>
            ) : null}
            {question?.hints?.length ? (
              <div className="ls-hints">
                <span>Hint ladder</span>
                <TextList items={question.hints} ordered />
              </div>
            ) : null}
            {onShowCandidate && suppliedPrompt && <button
              className="ls-button ls-button--candidate"
              type="button"
              onClick={onShowCandidate}
            >
              <MonitorUp size={17} /> Present to Hamad
            </button>}
            <button
              className="ls-flow-forward"
              type="button"
              onClick={() => moveTo("answer")}
            >
              Hamad has committed · go to Answer <ArrowRight size={16} />
            </button>
          </div>
        </CommandBlock>

        <CommandBlock
          icon={<Sparkles size={19} />}
          label="3 · Answer"
          tone="answer"
          active={flowStep === "answer"}
          sectionRef={answerRef}
          onActivate={() => moveTo("answer")}
        >
          {suppliedAnswer && <><p className="ls-model-response-cue">
            Say this naturally after Hamad commits to an answer.
          </p>
          <blockquote className="ls-spoken-answer">
            {suppliedAnswer}
          </blockquote>
          </>}
          {question?.answer &&
          question.spokenAnswer &&
          question.answer !== question.spokenAnswer ? (
            <div className="ls-answer-detail">
              <span>Final answer</span>
              <p>{question.answer}</p>
            </div>
          ) : null}
          {question?.working?.length ? (
            <div className="ls-answer-detail">
              <span>Clean working</span>
              <TextList items={question.working} ordered />
            </div>
          ) : null}
          {question?.rationale ? (
            <div className="ls-answer-detail">
              <span>Why this method</span>
              <p>{question.rationale}</p>
            </div>
          ) : null}
          {question?.interpretation ? (
            <div className="ls-answer-detail">
              <span>Economic meaning</span>
              <p>{question.interpretation}</p>
            </div>
          ) : null}
          {question?.trap ? (
            <div className="ls-trap-callout">
              <AlertTriangle size={17} />
              <p>
                <span>Watch for</span>
                {question.trap}
              </p>
            </div>
          ) : null}
          {question?.followUp ? (
            <div className="ls-answer-detail">
              <span>Pressure follow-up</span>
              <p>{question.followUp}</p>
            </div>
          ) : null}
        </CommandBlock>
      </div>

      {listenFor?.length || repair?.length ? (
        <details className="ls-coaching-drawer">
          <summary>
            <ClipboardCheck size={16} />
            <strong>Coaching cues</strong>
            <span>Evidence to hear and repair prompts</span>
          </summary>
          <div className="ls-coaching-rail">
            {listenFor?.length ? (
              <section>
                <header>
                  <CheckCircle2 size={17} />
                  <span>Evidence to hear</span>
                </header>
                <TextList items={listenFor} />
              </section>
            ) : null}
            {repair?.length ? (
              <section className="is-repair">
                <header>
                  <ClipboardCheck size={17} />
                  <span>Repair if the logic breaks</span>
                </header>
                <TextList items={repair} ordered />
              </section>
            ) : null}
          </div>
        </details>
      ) : null}
    </article>
  );
}
