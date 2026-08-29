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
  teachingScript: ["Separate income from capital gain, then divide by beginning value."],
  prompt: "Calculate and interpret the holding-period return.",
  spokenAnswer: "The holding-period return is 8%, including income and price appreciation.",
  rationale: "The denominator is the beginning investment value.",
  expectedSeconds: 90,
  difficulty: 3,
};

describe("StageCard", () => {
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
      />,
    );

    expect(html).toContain("1 · Teach");
    expect(html).toContain("2 · Ask");
    expect(html).toContain("3 · Answer");
    expect(html).toContain(question.explanation);
    expect(html).toContain(question.prompt);
    expect(html).toContain(question.spokenAnswer);
    expect(html).toContain('class="ls-command-block ls-command-block--question is-active"');
  });
});
