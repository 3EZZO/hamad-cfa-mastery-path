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
  TeachingDeckTier,
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

function teachingLayers(text: string): { core: string; depth?: string } {
  const normalized = text.trim();
  if (normalized.length <= 420) return { core: normalized };
  const sentences = normalized.match(/[^.!?]+[.!?]+(?:\s+|$)|[^.!?]+$/g) ?? [normalized];
  let used = 0;
  const coreParts: string[] = [];
  while (used < sentences.length && coreParts.join(" ").length < 260) {
    coreParts.push(sentences[used]!.trim());
    used += 1;
  }
  const core = coreParts.join(" ");
  const depth = sentences.slice(used).map(item => item.trim()).join(" ");
  return { core: core || normalized, depth: depth || undefined };
}

function teachingTier(card: TutorPlaybookCard): TeachingDeckTier {
  if (
    card.kind === "instruction" ||
    card.kind === "explanation" ||
    card.kind === "formula" ||
    card.kind === "checkpoint"
  ) {
    return "core";
  }
  if (card.kind === "question" || card.kind === "solution") {
    if ((card.difficulty ?? 3) >= 5) return "stretch";
    return (card.difficulty ?? 3) <= 3 ? "core" : "reinforcement";
  }
  return "reinforcement";
}

function adaptCard(
  card: TutorPlaybookCard,
  stage: TutorPlaybookStage,
  index: number,
): LiveSessionQuestion {
  const layers = teachingLayers(card.body || card.rationale || stage.objective);
  return {
    id: card.id,
    label: `${card.kind === "question" ? "Proof" : "Teach"} ${String(
      index + 1,
    ).padStart(2, "0")}`,
    title: card.title || stage.title,
    concept: stage.title,
    kind: CARD_KIND_MAP[card.kind],
    explanation: layers.core,
    depthNotes: layers.depth,
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
    tier: teachingTier(card),
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
  const selectedLiveCardIds = new Set<string>();

  const stagesByRoute = Object.fromEntries(
    value.manifest.routes.map(route => {
      const stages = route.stageIds.flatMap((stageId, routeIndex) => {
        const source = stageById.get(stageId);
        if (!source) return [];
        const sourceCardById = new Map(source.cards.map(card => [card.id, card]));
        const selectedIds = route.cardIdsByStage?.[stageId];
        const selectedCards = selectedIds
          ? selectedIds.flatMap(cardId => {
              const card = sourceCardById.get(cardId);
              return card ? [card] : [];
            })
          : source.cards;
        selectedCards.forEach(card => selectedLiveCardIds.add(card.id));
        const stage: LiveSessionStage = {
          id: source.id,
          order: routeIndex + 1,
          label: `Stage ${String(routeIndex + 1).padStart(2, "0")}`,
          title: source.title,
          durationMinutes: source.durationMinutesByRoute[route.id] ?? 0,
          objective: source.objective,
          explanation: source.objective,
          questions: selectedCards.map((card, index) =>
            adaptCard(card, source, index),
          ),
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
    routes: value.manifest.routes.map(route => {
      const routeStages = stagesByRoute[route.id] ?? [];
      const proofCount = routeStages.reduce(
        (total, stage) =>
          total + (stage.questions ?? []).filter(card => card.kind === "question").length,
        0,
      );
      const deckCount = routeStages.reduce(
        (total, stage) => total + (stage.questions?.length || 1),
        0,
      );
      return {
        id: route.id,
        name: route.label,
        minutes: route.totalMinutes,
        description: `${deckCount} Teach–Ask–Answer decks · ${route.stageIds.length} stages · ${proofCount} independent mastery proofs.`,
        recommended: route.id === value.manifest.defaultRouteId,
      };
    }),
    stagesByRoute,
    references: sourceStages.flatMap(stage => {
      const isRoutedStage = routedStageIds.has(stage.id);
      return stage.cards
        .filter(card => !isRoutedStage || !selectedLiveCardIds.has(card.id))
        .map(card => {
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
            category: isRoutedStage
              ? `Question Bank · ${stage.title}`
              : stage.title,
            summary: card.body || stage.objective,
            content: content.length ? content : [card.body || stage.objective],
            formulae:
              card.kind === "formula" ? cleanList([card.body, ...card.write]) : undefined,
            tags: [stage.id, card.kind, ...card.errorTags],
          };
        });
    }),
  };
}
