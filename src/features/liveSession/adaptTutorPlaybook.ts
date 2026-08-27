import type {
  TutorPlaybookCard,
  TutorPlaybookPackage,
  TutorPlaybookStage,
} from "../../lib/tutorContent";
import type {
  LiveSessionPlaybook,
  LiveSessionQuestion,
  LiveSessionStage,
  SessionContentKind,
} from "./types";

const CARD_KIND_MAP: Record<TutorPlaybookCard["kind"], SessionContentKind> = {
  instruction: "concept",
  explanation: "concept",
  formula: "concept",
  demonstration: "demonstration",
  "guided-practice": "demonstration",
  question: "question",
  solution: "question",
  repair: "repair",
  checkpoint: "checkpoint",
  reference: "concept",
  note: "concept",
};

function cleanList(values: readonly string[]): string[] | undefined {
  const result = values.map(value => value.trim()).filter(Boolean);
  return result.length ? result : undefined;
}

function spokenAnswer(card: TutorPlaybookCard): string {
  if (card.answer) return card.answer;
  if (card.rationale) return card.rationale;
  if (card.say.length) return card.say.join(" ");
  if (card.body) return card.body;
  if (card.masteryEvidence.length) {
    return `Listen for this proof: ${card.masteryEvidence.join("; ")}`;
  }
  return "Ask Hamad to explain the decision, method, and interpretation in that order.";
}

function prompt(card: TutorPlaybookCard, stage: TutorPlaybookStage): string {
  if (card.prompt) return card.prompt;
  if (card.ask.length) return card.ask[0] ?? stage.objective;
  if (card.title) return `Explain ${card.title} and show the decision rule.`;
  return stage.objective;
}

function adaptCard(
  card: TutorPlaybookCard,
  stage: TutorPlaybookStage,
  index: number,
): LiveSessionQuestion {
  return {
    id: card.id,
    label: `Desk ${String(index + 1).padStart(2, "0")}`,
    title: card.title || stage.title,
    concept: stage.title,
    kind: CARD_KIND_MAP[card.kind],
    explanation: card.body || card.rationale || stage.objective,
    teachingScript: cleanList(card.say),
    prompt: prompt(card, stage),
    answer: card.answer || undefined,
    spokenAnswer: spokenAnswer(card),
    rationale: card.rationale || undefined,
    working: cleanList(card.write),
    write: cleanList(card.write),
    listenFor: cleanList(card.listenFor),
    repair: cleanList(card.ifWrong),
    hints: cleanList(card.hints),
    tags: [card.kind, ...card.errorTags],
    difficulty: card.difficulty,
    expectedSeconds: card.expectedSeconds,
  };
}

/**
 * Converts the validated private Firestore package into the view model used by
 * Session Mode. No private content is copied to a public module or build asset.
 */
export function adaptTutorPlaybookPackage(
  value: TutorPlaybookPackage,
): LiveSessionPlaybook {
  const orderedChunks = [...value.chunks].sort((left, right) => left.order - right.order);
  const sourceStages = orderedChunks.flatMap(chunk => chunk.stages);
  const stageById = new Map(sourceStages.map(stage => [stage.id, stage]));
  const routedStageIds = new Set(
    value.manifest.routes.flatMap(route => route.stageIds),
  );

  const stagesByRoute = Object.fromEntries(
    value.manifest.routes.map(route => {
      const stages = route.stageIds.flatMap((stageId, routeIndex) => {
        const source = stageById.get(stageId);
        if (!source) return [];
        const stage: LiveSessionStage = {
          id: source.id,
          order: routeIndex + 1,
          label: `Stage ${String(routeIndex + 1).padStart(2, "0")}`,
          title: source.title,
          durationMinutes: source.durationMinutesByRoute[route.id] ?? 0,
          objective: source.objective,
          explanation: source.objective,
          questions: source.cards.map((card, index) => adaptCard(card, source, index)),
        };
        return [stage];
      });
      return [route.id, stages];
    }),
  );

  return {
    id: value.manifest.id,
    version: value.manifest.version,
    title: value.manifest.title,
    routes: value.manifest.routes.map(route => ({
      id: route.id,
      name: route.label,
      minutes: route.totalMinutes,
      description: `${route.stageIds.length} guided stages with live evidence capture.`,
      recommended: route.id === value.manifest.defaultRouteId,
    })),
    stagesByRoute,
    references: sourceStages
      .filter(stage => !routedStageIds.has(stage.id))
      .flatMap(stage =>
        stage.cards.map(card => {
          const content = [
            ...card.say,
            ...card.write.map(item => `Write: ${item}`),
            ...card.ask.map(item => `Ask: ${item}`),
            ...(card.prompt ? [`Question: ${card.prompt}`] : []),
            ...(card.answer ? [`Answer: ${card.answer}`] : []),
            ...(card.rationale ? [`Why: ${card.rationale}`] : []),
            ...card.listenFor.map(item => `Listen for: ${item}`),
            ...card.ifWrong.map(item => `If wrong: ${item}`),
          ].filter(Boolean);
          return {
            id: card.id,
            title: card.title || stage.title,
            category: stage.title,
            summary: card.body || stage.objective,
            content: content.length ? content : [card.body || stage.objective],
            formulae:
              card.kind === "formula" ? cleanList([card.body, ...card.write]) : undefined,
            tags: [stage.id, card.kind, ...card.errorTags],
          };
        }),
      ),
  };
}
