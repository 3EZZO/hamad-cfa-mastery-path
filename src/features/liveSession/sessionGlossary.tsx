import { Info } from "lucide-react";
import type { LiveSessionPlaybook } from "./types";
import { flattenSessionDecks } from "./sessionDeckModel";

export const SESSION_TERMS = {
  library: { label: "Library decks", meaning: "All teaching decks in this uploaded playbook, across its full teaching library." },
  route: { label: "Route decks", meaning: "The ordered decks in the teaching route you selected for this session." },
  queue: { label: "Navigation queue", meaning: "Route decks currently included by the Next/Previous filter. Filtering does not remove library content." },
  target: { label: "Live teaching target", meaning: "The ordered subset used for this session's time budget. It is a pacing guide, not a mastery score." },
  covered: { label: "Decks covered", meaning: "Route decks marked covered through teaching or a recorded assessment. Covered does not mean mastered." },
  proofs: { label: "Assessment proofs", meaning: "Questions that require a recorded judgement: Secure, Developing, Repair or Defer. A recorded proof is not necessarily correct." },
} as const;

export function libraryDeckCount(playbook: LiveSessionPlaybook): number {
  return playbook.libraryStages?.length
    ? flattenSessionDecks(playbook.libraryStages).length
    : Math.max(0, ...Object.values(playbook.stagesByRoute).map(stages => flattenSessionDecks(stages).length));
}

export function SessionCountLegend({ counts = {} }: {
  counts?: Partial<Record<keyof typeof SESSION_TERMS, number | string>>;
}) {
  return (
    <details className="ls-count-legend">
      <summary><Info size={15} aria-hidden="true" /> Counts explained</summary>
      <dl>
        {Object.entries(SESSION_TERMS).map(([key, term]) => (
          <div key={key}>
            <dt>{term.label}{counts[key as keyof typeof SESSION_TERMS] !== undefined && <strong>{counts[key as keyof typeof SESSION_TERMS]}</strong>}</dt>
            <dd>{term.meaning}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}
