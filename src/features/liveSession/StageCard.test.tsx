import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { StageCard } from "./StageCard";
import type { LiveSessionQuestion, LiveSessionStage } from "./types";

const stage: LiveSessionStage = {
  id: "returns",
  order: 1,
  label: "Stage 02",
  title: "Returns of Financial Assets and Instruments",
  durationMinutes: 20,
  objective: "Calculate and interpret holding-period return.",
};

const question: LiveSessionQuestion = {
  id: "holding-period-return",
  title: "Holding-period return",
  kind: "question",
  tier: "core",
  explanation: "Holding-period return combines income and price change.",
  teachingScript: [
    "Separate income from capital gain, then divide by beginning value.",
  ],
  prompt: "Calculate and interpret the holding-period return.",
  spokenAnswer:
    "The holding-period return is 8%, including income and price appreciation.",
  rationale: "The denominator is the beginning investment value.",
  formulae: ["HPR = (P1 - P0 + D1) / P0"],
  working: ["Identify beginning value.", "Add income to the price change."],
  expectedSeconds: 90,
  difficulty: 3,
};

describe("StageCard", () => {
  it("does not invent an answer or turn a stage objective into a question", () => {
    const html = renderToStaticMarkup(<StageCard stage={stage} question={{ id: "empty", title: "Empty fixture", prompt: "" }} questionIndex={0} flowStep="teach" complete={false} onFlowStepChange={() => undefined} onShowCandidate={() => undefined} />);
    expect(html).not.toContain("Ask for the decision rule");
    expect(html).not.toContain('class="ls-spoken-answer"');
    expect(html).not.toContain("Present to Hamad");
  });
  it("retains the complete title and objective with an explicit objective disclosure", () => {
    const html = renderToStaticMarkup(
      <StageCard stage={stage} question={question} questionIndex={0} flowStep="teach" complete={false} onFlowStepChange={() => undefined} />
    );
    expect(html).toContain(question.title);
    expect(html).toContain('<details class="ls-deck-objective"><summary>Teaching objective</summary>');
    expect(html).toContain(stage.objective);
  });
  it("keeps Teach, Ask, and Answer content visible in one tutor view", () => {
    const html = renderToStaticMarkup(
      <StageCard
        stage={stage}
        question={question}
        questionIndex={0}
        flowStep="ask"
        complete={false}
        onFlowStepChange={() => undefined}
        onShowCandidate={() => undefined}
      />
    );

    expect(html).toContain(">Teach</strong>");
    expect(html).toContain(">Ask</strong>");
    expect(html).toContain(">Answer</strong>");
    expect(html).not.toContain("1 · Teach");
    expect(html).toContain(question.explanation);
    expect(html).toContain(question.prompt);
    expect(html).toContain(question.spokenAnswer);
    expect(html).toContain("Governing relationship");
    expect(html).toContain('class="ls-formula-line"');
    expect(html).toContain('class="financial-expression"');
    expect(html).toContain("Application sequence");
    expect(html).toContain('class="financial-working"');
    expect(html).toContain(
      'class="ls-command-block ls-command-block--question is-active"'
    );
    expect(html.match(/class="ls-panel-step"/g)).toHaveLength(3);
    expect(html.match(/class="ls-reading-progress"/g)).toHaveLength(3);
    expect(html.match(/aria-current="step"/g)).toHaveLength(1);
    expect(html).not.toContain('class="ls-teach-flow"');
    expect(html).not.toContain('aria-expanded="false"');
  });
});
