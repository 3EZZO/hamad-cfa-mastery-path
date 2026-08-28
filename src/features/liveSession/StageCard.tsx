import {
  AlertTriangle,
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
import type { LiveSessionQuestion, LiveSessionStage } from "./types";

export interface StageCardProps {
  stage: LiveSessionStage;
  question?: LiveSessionQuestion;
  questionIndex: number;
  onShowCandidate: () => void;
}

function TextList({ items, ordered = false }: { items?: string[]; ordered?: boolean }) {
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
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
  tone: "explain" | "question" | "answer";
}) {
  return (
    <section className={`ls-command-block ls-command-block--${tone}`}>
      <header>
        <span className="ls-command-block__icon" aria-hidden="true">{icon}</span>
        <span>{label}</span>
      </header>
      <div className="ls-command-block__body">{children}</div>
    </section>
  );
}

function bestExplanation(stage: LiveSessionStage, question?: LiveSessionQuestion): string {
  return question?.explanation || stage.explanation || stage.objective;
}

function bestScript(stage: LiveSessionStage, question?: LiveSessionQuestion): string[] {
  if (question?.teachingScript?.length) return question.teachingScript;
  if (stage.say?.length) return stage.say;
  return [bestExplanation(stage, question)];
}

function bestAnswer(question?: LiveSessionQuestion): string {
  return (
    question?.spokenAnswer ||
    question?.answer ||
    question?.rationale ||
    "Ask for the decision rule, calculation path, and interpretation in that order."
  );
}

const PROOF_STEPS = ["Recognize", "Predict", "Set up", "Solve", "Interpret"];

function proofStepIndex(question?: LiveSessionQuestion): number {
  if (question?.kind === "question") return 3;
  if (question?.kind === "repair" || question?.kind === "checkpoint") return 4;
  if (question?.kind === "demonstration" || question?.kind === "calculator") return 2;
  return 0;
}

export function StageCard({
  stage,
  question,
  questionIndex,
  onShowCandidate,
}: StageCardProps) {
  const listenFor = question?.listenFor?.length ? question.listenFor : stage.listenFor;
  const repair = question?.repair?.length ? question.repair : stage.repair;
  const write = question?.write?.length
    ? question.write
    : question?.working?.length
      ? question.working
      : stage.write;
  const activeProofStep = proofStepIndex(question);

  return (
    <article className="ls-stage-card" aria-labelledby="ls-stage-title">
      <header className="ls-stage-card__header">
        <div className="ls-stage-card__identity">
          <p className="ls-eyebrow">{stage.label}</p>
          <h2 id="ls-stage-title">{question?.title || stage.title}</h2>
          <p>{stage.objective}</p>
        </div>
        <div className="ls-item-meta" aria-label="Current teaching item details">
          <span><Route size={15} /> Item {questionIndex + 1}</span>
          {question?.kind && <span><BookOpen size={15} /> {question.kind}</span>}
          {question?.difficulty ? <span><Gauge size={15} /> Level {question.difficulty}/5</span> : null}
          {question?.expectedSeconds ? <span><Clock3 size={15} /> {Math.ceil(question.expectedSeconds / 60)} min</span> : null}
        </div>
      </header>

      <section className="ls-proof-rail" aria-label="Mastery proof sequence">
        <div>
          <span>Decision proof</span>
          <strong>From recognition to economic meaning</strong>
        </div>
        <ol>
          {PROOF_STEPS.map((step, index) => (
            <li
              className={`${index === activeProofStep ? "is-current" : ""}${
                index < activeProofStep ? " is-passed" : ""
              }`}
              aria-current={index === activeProofStep ? "step" : undefined}
              key={step}
            >
              <span>{index + 1}</span>
              <strong>{step}</strong>
            </li>
          ))}
        </ol>
      </section>

      <div className="ls-command-grid" aria-label="Tutor command desk">
        <CommandBlock icon={<Lightbulb size={19} />} label="Core idea" tone="explain">
          <p className="ls-command-lead">{bestExplanation(stage, question)}</p>
          <div className="ls-script-ribbon">
            <span><Quote size={15} /> Teach it</span>
            <TextList items={bestScript(stage, question)} ordered={bestScript(stage, question).length > 1} />
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
              {question.formulae.map(formula => <code key={formula}>{formula}</code>)}
            </div>
          ) : null}
          {write?.length ? (
            <div className="ls-board-cue">
              <span><PenLine size={15} /> Write or draw</span>
              <TextList items={write} ordered />
            </div>
          ) : null}
        </CommandBlock>

        <CommandBlock icon={<MessageSquareText size={19} />} label="Check understanding" tone="question">
          <div className="ls-question-copy">
            <div className="ls-question-copy__topline">
              <span>{question?.label ?? `Proof ${questionIndex + 1}`}</span>
              {question?.id && <code>{question.id}</code>}
            </div>
            <h3>{question?.prompt ?? stage.ask?.[0] ?? stage.objective}</h3>
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
            <button className="ls-button ls-button--candidate" type="button" onClick={onShowCandidate}>
              <MonitorUp size={17} /> Present to Hamad
            </button>
          </div>
        </CommandBlock>

        <CommandBlock icon={<Sparkles size={19} />} label="Model response" tone="answer">
          <p className="ls-model-response-cue">
            Say this naturally after Hamad commits to an answer.
          </p>
          <blockquote className="ls-spoken-answer">{bestAnswer(question)}</blockquote>
          {question?.answer && question.spokenAnswer && question.answer !== question.spokenAnswer ? (
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
              <p><span>Watch for</span>{question.trap}</p>
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

      {(listenFor?.length || repair?.length) ? (
        <div className="ls-coaching-rail">
          {listenFor?.length ? (
            <section>
              <header><CheckCircle2 size={17} /><span>Evidence to hear</span></header>
              <TextList items={listenFor} />
            </section>
          ) : null}
          {repair?.length ? (
            <section className="is-repair">
              <header><ClipboardCheck size={17} /><span>Repair if the logic breaks</span></header>
              <TextList items={repair} ordered />
            </section>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}
