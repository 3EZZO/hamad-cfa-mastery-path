import { describe, expect, it } from "vitest";
import type { TutorPlaybookCard, TutorPlaybookPackage } from "../../lib/tutorContent";
import { adaptTutorPlaybookPackage } from "./adaptTutorPlaybook";

function card(id: string, title: string): TutorPlaybookCard {
  return {
    id,
    kind: "question",
    title,
    body: "Choose the measure, predict the direction, and explain the result.",
    say: ["Name the economic decision before touching the calculator."],
    write: ["Decision → setup → calculation → meaning"],
    ask: ["Which measure answers the decision?"],
    prompt: "Which measure answers the decision?",
    answer: "Use the measure that matches the decision horizon.",
    rationale: "The measure and the economic question must match.",
    listenFor: ["Decision before formula"],
    ifWrong: ["Restate the decision in one sentence."],
    hints: [],
    masteryEvidence: ["Selects and defends the measure independently."],
    errorTags: ["D"],
    expectedSeconds: 60,
    difficulty: 2,
  };
}

describe("private playbook adapter", () => {
  it("runs the curated route and sends unselected drills to the Question Bank", () => {
    const playbook: TutorPlaybookPackage = {
      manifest: {
        schemaVersion: 1,
        id: "session-01",
        sessionNumber: 1,
        title: "Session 01",
        version: "v2",
        contentHash: "a".repeat(64),
        defaultRouteId: "route-150",
        routes: [
          {
            id: "route-150",
            label: "Mastery route",
            totalMinutes: 150,
            stageIds: ["returns"],
            cardIdsByStage: { returns: ["selected-proof"] },
          },
        ],
        chunkIds: ["live"],
        revision: 1,
        publishedBy: "tutor",
        publishedAtClient: "2026-08-28T00:00:00.000Z",
      },
      chunks: [
        {
          schemaVersion: 1,
          id: "live",
          order: 0,
          kind: "stage",
          title: "Returns",
          contentHash: "b".repeat(64),
          stages: [
            {
              id: "returns",
              title: "Return selection",
              objective: "Select and defend the correct return measure.",
              durationMinutesByRoute: { "route-150": 150 },
              cards: [
                card("selected-proof", "Route proof"),
                card("deep-drill", "Question-bank drill"),
              ],
            },
          ],
          playbookId: "session-01",
          version: "v2",
          storageId: "session-01--v2--live",
          publishedBy: "tutor",
          publishedAtClient: "2026-08-28T00:00:00.000Z",
        },
      ],
    };

    const adapted = adaptTutorPlaybookPackage(playbook);

    expect(adapted.stagesByRoute["route-150"]?.[0]?.questions?.map(item => item.id))
      .toEqual(["selected-proof"]);
    expect(adapted.references).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "deep-drill",
          category: "Question Bank · Return selection",
        }),
      ]),
    );
  });
});
