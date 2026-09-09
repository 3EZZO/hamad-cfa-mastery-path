import { describe, expect, it } from "vitest";
import { syntheticPlaybook } from "../../testFixtures/tutorPlaybooks";
import { adaptTutorPlaybookPackage } from "./adaptTutorPlaybook";
import { flattenSessionDecks } from "./sessionDeckModel";
import { evaluateSessionPreflight } from "./sessionPreflight";
import type { LiveSessionPlaybook } from "./types";

function preflight(playbook: LiveSessionPlaybook, routeId: string) {
  return evaluateSessionPreflight({
    playbook,
    authReady: true,
    userUid: "tutor",
    membershipReady: true,
    memberActive: true,
    role: "tutor",
    cloudAccess: "ready",
    offlineReady: true,
    syncState: "synced",
    timerReady: true,
    calculatorReady: true,
    position: { routeId, stageIndex: 0, questionIndex: 0 },
  });
}

describe("Session 2 teaching routes", () => {
  it("accepts the curated 48/60-deck routes with all 120 searchable in the library", async () => {
    const book = adaptTutorPlaybookPackage(await syntheticPlaybook(2));
    expect(book.routes.map(route => route.expectedDeckCount)).toEqual([
      48, 60, 120,
    ]);
    expect(book.routes.map(route => route.curated)).toEqual([
      true,
      true,
      false,
    ]);
    expect(preflight(book, book.routes[0]!.id).canStart).toBe(true);
    expect(preflight(book, book.routes[1]!.id).canStart).toBe(true);
    expect(preflight(book, book.routes[2]!.id).canStart).toBe(false);
    expect(book.routes[2]!.referenceOnly).toBe(true);
    const library = flattenSessionDecks(book.libraryStages!);
    expect(library).toHaveLength(120);
    expect(library[119]!.question).toMatchObject({
      explanation: "Synthetic concept 120.",
      prompt: "Fixture question?",
      answer: "Fixture answer.",
    });
  });
  it("does not mistake a missing selected card for a smaller valid route", async () => {
    const book = adaptTutorPlaybookPackage(await syntheticPlaybook(2));
    const route = book.routes[0]!;
    book.stagesByRoute[route.id]![0]!.questions!.pop();
    const report = preflight(book, route.id);
    expect(report.canStart).toBe(false);
    expect(
      report.checks.find(check => check.id === "playbook")?.detail
    ).toContain("Expected 48");
  });
  it("retains S1's existing estimated pacing target behavior", async () => {
    const book = adaptTutorPlaybookPackage(await syntheticPlaybook(1));
    expect(book.routes[0]!.curated).toBe(false);
    expect(preflight(book, book.routes[0]!.id).canStart).toBe(true);
  });
});
