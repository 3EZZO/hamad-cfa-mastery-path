// Synthetic fixtures only. No private curriculum content belongs in this repo.
import {
  computeTutorPlaybookChunkContentHash,
  computeTutorPlaybookManifestContentHash,
  type TutorPlaybookCard,
  type TutorPlaybookPackage,
  type TutorPlaybookPackageDraft,
} from "../lib/tutorContent";
import {
  getTutorSession,
  type TutorSessionNumber,
} from "../lib/tutorSessionCatalog";

export async function syntheticPlaybook(
  number: TutorSessionNumber
): Promise<TutorPlaybookPackage> {
  const cards: TutorPlaybookCard[] = Array.from(
    { length: 120 },
    (_, index) => ({
      id: `s${number}-card-${index + 1}`,
      kind: "question",
      title: `Fixture deck ${index + 1}`,
      body: `Synthetic concept ${index + 1}.`,
      say: ["Explain this fixture."],
      write: ["Fixture working."],
      ask: ["Fixture question?"],
      prompt: "Fixture question?",
      answer: "Fixture answer.",
      rationale: "Fixture rationale.",
      listenFor: ["Fixture proof."],
      ifWrong: ["Repair this fixture."],
      hints: [],
      masteryEvidence: ["Fixture evidence."],
      errorTags: [],
      expectedSeconds: 180,
      difficulty: 3,
    })
  );
  const routes = (
    number === 2
      ? [
          [48, 120],
          [60, 150],
          [120, 360],
        ]
      : [[120, 150]]
  ).map(([count, minutes]) => ({
    id: `s${number}-${count}-${minutes}`,
    label: `Fixture ${minutes}`,
    totalMinutes: minutes!,
    stageIds: ["fixture-stage"],
    cardIdsByStage: {
      "fixture-stage": cards.slice(0, count).map(card => card.id),
    },
  }));
  const draft: TutorPlaybookPackageDraft = {
    manifest: {
      schemaVersion: 1,
      id: getTutorSession(number).playbookId,
      sessionNumber: number,
      title: `Session ${number} fixture`,
      version: `s0${number}-test-v1`,
      contentHash: "a".repeat(64),
      defaultRouteId: routes[0]!.id,
      routes,
      chunkIds: ["fixture-chunk"],
    },
    chunks: [
      {
        schemaVersion: 1,
        id: "fixture-chunk",
        order: 0,
        kind: "questions",
        title: "Fixtures",
        contentHash: "b".repeat(64),
        stages: [
          {
            id: "fixture-stage",
            title: "Fixture module",
            objective: "Verify state separation.",
            durationMinutesByRoute: Object.fromEntries(
              routes.map(route => [route.id, route.totalMinutes])
            ),
            cards,
          },
        ],
      },
    ],
  };
  draft.chunks[0]!.contentHash = await computeTutorPlaybookChunkContentHash(
    draft.chunks[0]!
  );
  draft.manifest.contentHash = await computeTutorPlaybookManifestContentHash(
    draft.manifest,
    draft.chunks
  );
  const publication = {
    publishedBy: "fixture-tutor",
    publishedAtClient: "2026-09-09T00:00:00.000Z",
  };
  return {
    manifest: { ...draft.manifest, ...publication, revision: 1 },
    chunks: draft.chunks.map(chunk => ({
      ...chunk,
      ...publication,
      playbookId: draft.manifest.id,
      version: draft.manifest.version,
      storageId: `${draft.manifest.id}--${draft.manifest.version}--${chunk.id}`,
    })),
  };
}

export function asDraft(
  value: TutorPlaybookPackage
): TutorPlaybookPackageDraft {
  const {
    revision: _r,
    publishedBy: _p,
    publishedAtClient: _at,
    ...manifest
  } = value.manifest;
  return {
    manifest,
    chunks: value.chunks.map(chunk => {
      const {
        playbookId: _id,
        version: _v,
        storageId: _s,
        publishedBy: _p,
        publishedAtClient: _at,
        ...draft
      } = chunk;
      return draft;
    }),
  };
}
