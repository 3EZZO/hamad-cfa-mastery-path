import { describe, expect, it } from "vitest";
import {
  applyTutorLiveRunAction,
  buildTutorPlaybookChunkStorageId,
  computeTutorPlaybookChunkContentHash,
  computeTutorPlaybookManifestContentHash,
  parseTutorLiveRun,
  parseTutorLiveRunAction,
  parseTutorPlaybookChunk,
  parseTutorPlaybookManifest,
  parseTutorPlaybookPackageDraft,
  TutorContentValidationError,
  TutorLiveRunConflictError,
  validateTutorPlaybookPackage,
  verifyTutorPlaybookPackageIntegrity,
  type TutorLiveRun,
  type TutorLiveRunAction,
  type TutorLiveRunSaveRequest,
  type TutorPlaybookChunk,
  type TutorPlaybookManifest,
} from "./tutorContent";

const HASH_A = "a".repeat(64);
const HASH_B = "b".repeat(64);
const STARTED_AT = "2026-09-05T06:00:00.000Z";

function card(id: string) {
  return {
    id,
    kind: "question",
    title: "Return selection",
    body: "Choose the measure before calculating.",
    say: ["Name the decision first."],
    write: ["Decision -> measure -> calculation -> interpretation"],
    ask: ["Which return answers this decision?"],
    prompt: "Which return measure should be used?",
    answer: "Use the geometric mean for compounded wealth growth.",
    rationale: "It preserves the multiplicative path.",
    listenFor: ["Compounding across periods"],
    ifWrong: ["Rebuild the wealth relatives."],
    hints: ["Think in growth factors."],
    masteryEvidence: ["Explains the choice without a formula prompt."],
    errorTags: ["D"],
    expectedSeconds: 90,
    difficulty: 3,
  };
}

function stage(id: string, minutes: number) {
  return {
    id,
    title: id === "launch" ? "Cold launch" : "Return measures",
    objective: "Produce independent evidence.",
    durationMinutesByRoute: { standard: minutes },
    cards: [card(`${id}-q01`)],
  };
}

function draftPackage() {
  return {
    manifest: {
      schemaVersion: 1,
      id: "session-01",
      sessionNumber: 1,
      title: "Session 01 Quant Tutor Bible",
      version: "s01-a1",
      contentHash: HASH_A,
      defaultRouteId: "standard",
      routes: [
        {
          id: "standard",
          label: "150-minute standard route",
          totalMinutes: 150,
          stageIds: ["launch", "returns"],
          cardIdsByStage: {
            launch: ["launch-q01"],
            returns: ["returns-q01"],
          },
        },
      ],
      chunkIds: ["chunk-launch", "chunk-returns"],
    },
    // Deliberately reversed: the parser must return deterministic chunk order.
    chunks: [
      {
        schemaVersion: 1,
        id: "chunk-returns",
        order: 1,
        kind: "questions",
        title: "Return questions",
        contentHash: HASH_B,
        stages: [stage("returns", 145)],
      },
      {
        schemaVersion: 1,
        id: "chunk-launch",
        order: 0,
        kind: "stage",
        title: "Opening stage",
        contentHash: HASH_A,
        stages: [stage("launch", 5)],
      },
    ],
  };
}

function publishedPackage(): {
  manifest: TutorPlaybookManifest;
  chunks: TutorPlaybookChunk[];
} {
  const draft = parseTutorPlaybookPackageDraft(draftPackage());
  const publishedAtClient = "2026-08-27T09:00:00.000Z";
  const manifest = parseTutorPlaybookManifest({
    ...draft.manifest,
    revision: 1,
    publishedBy: "tutor-uid",
    publishedAtClient,
  });
  const chunks = draft.chunks.map((item) =>
    parseTutorPlaybookChunk({
      ...item,
      playbookId: manifest.id,
      version: manifest.version,
      storageId: buildTutorPlaybookChunkStorageId(
        manifest.id,
        manifest.version,
        item.id,
      ),
      publishedBy: "tutor-uid",
      publishedAtClient,
    }),
  );
  return { manifest, chunks };
}

function action(
  id: string,
  type: TutorLiveRunAction["type"],
  elapsedSeconds: number,
  extra: Partial<TutorLiveRunAction> = {},
): TutorLiveRunAction {
  return {
    id,
    type,
    atClient: new Date(Date.parse(STARTED_AT) + elapsedSeconds * 1_000).toISOString(),
    elapsedSeconds,
    ...extra,
  };
}

function saveRequest(
  expectedRevision: number,
  event: TutorLiveRunAction,
): TutorLiveRunSaveRequest {
  return {
    runId: "session-01-2026-09-05",
    playbookId: "session-01",
    playbookVersion: "s01-a1",
    sessionNumber: 1,
    routeId: "standard",
    expectedRevision,
    action: event,
  };
}

function closeout() {
  return {
    mastery: [
      { stageId: "launch", stageTitle: "Cold launch", decision: "green" as const },
      {
        stageId: "returns",
        stageTitle: "Return measures",
        decision: "amber" as const,
      },
    ],
    outcome: "Hamad selected the correct return measure on a fresh prompt.",
    nextAction: "Retest geometric versus arithmetic return after 48 hours.",
    homework: "Complete the assigned return-measure set.",
    delayedRetest: "Two fresh questions on 7 September.",
    privateTutorNote: "Watch high-confidence definition errors.",
  };
}

describe("private Tutor Bible package validation", () => {
  it("strictly parses a package and orders immutable chunks by manifest order", () => {
    const parsed = parseTutorPlaybookPackageDraft(draftPackage());

    expect(parsed.manifest.defaultRouteId).toBe("standard");
    expect(parsed.manifest.routes[0]?.cardIdsByStage?.returns).toEqual([
      "returns-q01",
    ]);
    expect(parsed.chunks.map((item) => item.id)).toEqual([
      "chunk-launch",
      "chunk-returns",
    ]);
    expect(parsed.chunks[1]?.stages[0]?.cards[0]?.answer).toMatch(/geometric/i);
  });

  it("rejects unsupported fields, duplicate IDs, broken routes, and oversized chunks", () => {
    const unknownField = draftPackage();
    Object.assign(unknownField.manifest, { studentReadableAnswerKey: true });
    expect(() => parseTutorPlaybookPackageDraft(unknownField)).toThrow(
      /unsupported fields/i,
    );

    const brokenRoute = draftPackage();
    brokenRoute.manifest.routes[0]!.totalMinutes = 149;
    expect(() => parseTutorPlaybookPackageDraft(brokenRoute)).toThrow(
      /stages total 150/i,
    );

    const brokenCardSelection = draftPackage();
    brokenCardSelection.manifest.routes[0]!.cardIdsByStage.returns = [
      "missing-card",
    ];
    expect(() => parseTutorPlaybookPackageDraft(brokenCardSelection)).toThrow(
      /references missing card missing-card/i,
    );

    const duplicateCard = draftPackage();
    duplicateCard.chunks[0]!.stages[0]!.cards.push(
      duplicateCard.chunks[1]!.stages[0]!.cards[0]!,
    );
    expect(() => parseTutorPlaybookPackageDraft(duplicateCard)).toThrow(
      /duplicate IDs/i,
    );

    const oversized = draftPackage();
    oversized.chunks[0]!.stages[0]!.cards[0]!.body = "x".repeat(451_000);
    expect(() => parseTutorPlaybookPackageDraft(oversized)).toThrow(
      /safe limit/i,
    );
  });

  it("cross-validates published chunk ownership and returns manifest order", () => {
    const { manifest, chunks } = publishedPackage();
    const validated = validateTutorPlaybookPackage(manifest, [...chunks].reverse());
    expect(validated.chunks.map((item) => item.id)).toEqual(manifest.chunkIds);

    const foreign = { ...chunks[0]!, playbookId: "session-02" };
    expect(() => validateTutorPlaybookPackage(manifest, [foreign, chunks[1]!])).toThrow(
      /active manifest version/i,
    );
  });

  it("cryptographically rejects altered chunks and manifest metadata", async () => {
    const raw = draftPackage();
    const parsed = parseTutorPlaybookPackageDraft(raw);
    for (const item of parsed.chunks) {
      item.contentHash = await computeTutorPlaybookChunkContentHash(item);
    }
    parsed.manifest.contentHash = await computeTutorPlaybookManifestContentHash(
      parsed.manifest,
      parsed.chunks,
    );
    await expect(verifyTutorPlaybookPackageIntegrity(parsed)).resolves.toEqual(
      parsed,
    );

    const altered = structuredClone(parsed);
    altered.chunks[0]!.stages[0]!.cards[0]!.answer = "A changed answer.";
    await expect(verifyTutorPlaybookPackageIntegrity(altered)).rejects.toThrow(
      /does not match the chunk contents/i,
    );

    const alteredManifest = structuredClone(parsed);
    alteredManifest.manifest.title = "Changed title";
    await expect(
      verifyTutorPlaybookPackageIntegrity(alteredManifest),
    ).rejects.toThrow(/versioned package contents/i);
  });
});

describe("private tutor live-run state machine", () => {
  it("creates, pauses, resumes, assesses, and completes one revision per action", () => {
    let run: TutorLiveRun | null = applyTutorLiveRunAction(
      null,
      saveRequest(0, action("event-01", "start", 0, { stageId: "launch" })),
      "tutor-uid",
    );
    expect(run).toMatchObject({ status: "running", revision: 1 });

    run = applyTutorLiveRunAction(
      run,
      saveRequest(1, action("event-02", "pause", 120)),
      "tutor-uid",
    );
    expect(run.status).toBe("paused");

    run = applyTutorLiveRunAction(
      run,
      saveRequest(2, action("event-03", "note", 125, { note: "Parking a question." })),
      "tutor-uid",
    );
    run = applyTutorLiveRunAction(
      run,
      saveRequest(3, action("event-04", "resume", 130)),
      "tutor-uid",
    );
    run = applyTutorLiveRunAction(
      run,
      saveRequest(
        4,
        action("event-05", "assessment", 300, {
          stageId: "returns",
          cardId: "returns-q01",
          result: "partial",
          confidence: 4,
          errorCodes: ["D", "I"],
          note: "Method selected only after a prompt.",
        }),
      ),
      "tutor-uid",
    );
    run = applyTutorLiveRunAction(
      run,
      saveRequest(
        5,
        action("event-06", "complete", 600, { closeout: closeout() }),
      ),
      "tutor-uid",
    );

    expect(run).toMatchObject({
      status: "completed",
      revision: 6,
      elapsedSeconds: 600,
      currentStageId: "returns",
      currentCardId: "returns-q01",
    });
    expect(run.events).toHaveLength(6);
    expect(run.events[4]).toMatchObject({
      confidence: 4,
      errorCodes: ["D", "I"],
    });
    expect(run.events[5]?.closeout?.mastery[1]?.decision).toBe("amber");
    expect(run.endedAtClient).toBe(run.updatedAtClient);
    expect(parseTutorLiveRun(run)).toEqual(run);
  });

  it("rejects malformed action semantics and non-canonical timestamps", () => {
    expect(() =>
      parseTutorLiveRunAction(
        action("event-01", "assessment", 10, {
          stageId: "returns",
          cardId: "returns-q01",
        }),
      ),
    ).toThrow(/result/i);

    expect(() =>
      parseTutorLiveRunAction(
        action("event-01", "repair", 10, {
          stageId: "returns",
          cardId: "returns-q01",
        }),
      ),
    ).toThrow(/errorCodes/i);

    expect(() =>
      parseTutorLiveRunAction({
        ...action("event-01", "start", 0, { stageId: "launch" }),
        atClient: "2026-09-05 09:00:00",
      }),
    ).toThrow(/canonical UTC ISO/i);
  });

  it("rejects stale revisions, duplicate actions, backward time, and terminal mutation", () => {
    const run = applyTutorLiveRunAction(
      null,
      saveRequest(0, action("event-01", "start", 0, { stageId: "launch" })),
      "tutor-uid",
    );

    expect(() =>
      applyTutorLiveRunAction(
        run,
        saveRequest(0, action("event-02", "pause", 10)),
        "tutor-uid",
      ),
    ).toThrow(TutorLiveRunConflictError);
    expect(() =>
      applyTutorLiveRunAction(
        run,
        saveRequest(1, action("event-01", "navigate", 10, { stageId: "returns" })),
        "tutor-uid",
      ),
    ).toThrow(/already been saved/i);
    expect(() =>
      applyTutorLiveRunAction(
        run,
        saveRequest(1, action("event-02", "navigate", -1, { stageId: "returns" })),
        "tutor-uid",
      ),
    ).toThrow(TutorContentValidationError);

    const completed = applyTutorLiveRunAction(
      run,
      saveRequest(
        1,
        action("event-02", "complete", 20, { closeout: closeout() }),
      ),
      "tutor-uid",
    );
    expect(() =>
      applyTutorLiveRunAction(
        completed,
        saveRequest(2, action("event-03", "note", 21, { note: "Too late" })),
        "tutor-uid",
      ),
    ).toThrow(/immutable/i);
  });

  it("rejects a forged run whose top-level state disagrees with its event history", () => {
    const run = applyTutorLiveRunAction(
      null,
      saveRequest(0, action("event-01", "start", 0, { stageId: "launch" })),
      "tutor-uid",
    );
    expect(() => parseTutorLiveRun({ ...run, status: "paused" })).toThrow(
      /action history/i,
    );
    expect(() => parseTutorLiveRun({ ...run, currentStageId: "returns" })).toThrow(
      /action history/i,
    );
    expect(() => parseTutorLiveRun({ ...run, revision: 2 })).toThrow(
      /number of saved actions/i,
    );
  });
});
