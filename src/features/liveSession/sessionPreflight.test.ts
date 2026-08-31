import { describe, expect, it } from "vitest";
import type {
  LiveSessionPlaybook,
  LiveSessionQuestion,
  LiveSessionStage,
} from "./types";
import {
  countSessionPlaybookDecks,
  countSessionRouteDecks,
  evaluateSessionPreflight,
  type SessionPreflightInput,
} from "./sessionPreflight";

function cards(count: number, prefix: string): LiveSessionQuestion[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `${prefix}-${index + 1}`,
    prompt: `Prompt ${index + 1}`,
  }));
}

function stage(id: string, count: number): LiveSessionStage {
  return {
    id,
    order: Number(id.slice(-1)),
    label: id,
    title: `Stage ${id.slice(-1)}`,
    durationMinutes: 50,
    objective: "Establish mastery.",
    questions: cards(count, id),
  };
}

function playbook(lastStageDecks = 40): LiveSessionPlaybook {
  const stages = [
    stage("stage-1", 40),
    stage("stage-2", 40),
    stage("stage-3", lastStageDecks),
  ];
  return {
    id: "session-01",
    version: "s01-v1",
    title: "Session 01",
    routes: [
      {
        id: "standard",
        name: "Standard",
        minutes: 150,
        description: "Full route",
        recommended: true,
      },
      {
        id: "fast",
        name: "Fast",
        minutes: 120,
        description: "Fast route",
      },
    ],
    stagesByRoute: { standard: stages, fast: stages },
    references: [],
  };
}

function readyInput(
  overrides: Partial<SessionPreflightInput> = {}
): SessionPreflightInput {
  return {
    authReady: true,
    userUid: "tutor-uid",
    membershipReady: true,
    memberActive: true,
    role: "tutor",
    cloudAccess: "ready",
    playbook: playbook(),
    offlineReady: true,
    syncState: "synced",
    timerReady: true,
    calculatorReady: true,
    position: { routeId: "standard", stageIndex: 1, questionIndex: 1 },
    ...overrides,
  };
}

describe("session preflight", () => {
  it("accepts a fully ready tutor session and resolves the current deck", () => {
    const report = evaluateSessionPreflight(readyInput());

    expect(countSessionPlaybookDecks(readyInput().playbook)).toBe(120);
    expect(countSessionRouteDecks(readyInput().playbook, "standard")).toBe(120);
    expect(report).toMatchObject({
      canStart: true,
      readyCount: 7,
      warningCount: 0,
      blockingCount: 0,
      position: {
        stageId: "stage-2",
        cardId: "stage-2-2",
        deckNumber: 42,
        deckCount: 120,
      },
    });
  });

  it("blocks missing, inactive, non-tutor, and cloud-rejected access", () => {
    const cases: Array<[Partial<SessionPreflightInput>, string]> = [
      [{ userUid: null }, "Sign in"],
      [{ memberActive: false }, "active project membership"],
      [{ role: "student" }, "active tutor membership"],
      [{ cloudAccess: "denied" }, "private cloud access was rejected"],
    ];

    for (const [overrides, detail] of cases) {
      const access = evaluateSessionPreflight(readyInput(overrides)).checks[0];
      expect(access).toMatchObject({ status: "blocked", blocksStart: true });
      expect(access?.detail).toContain(detail);
    }
  });

  it("blocks a partial playbook and an invalid restored position", () => {
    const report = evaluateSessionPreflight(
      readyInput({
        playbook: playbook(39),
        position: { routeId: "standard", stageIndex: 5, questionIndex: 0 },
      })
    );

    expect(report.canStart).toBe(false);
    expect(
      report.checks.find(candidate => candidate.id === "playbook")
    ).toMatchObject({
      status: "blocked",
      detail: "Expected 120 decks, but this playbook contains 119.",
    });
    expect(
      report.checks.find(candidate => candidate.id === "position")
    ).toMatchObject({
      status: "blocked",
    });
  });

  it("validates the selected route instead of accepting a larger sibling route", () => {
    const value = playbook();
    value.stagesByRoute.fast = [stage("stage-1", 40), stage("stage-2", 40)];
    const report = evaluateSessionPreflight(
      readyInput({
        playbook: value,
        position: { routeId: "fast", stageIndex: 0, questionIndex: 0 },
      })
    );

    expect(countSessionPlaybookDecks(value)).toBe(120);
    expect(countSessionRouteDecks(value, "fast")).toBe(80);
    expect(
      report.checks.find(candidate => candidate.id === "playbook")
    ).toMatchObject({ status: "blocked" });
  });

  it("allows degraded sync only when verified offline recovery is ready", () => {
    const recoverable = evaluateSessionPreflight(
      readyInput({ syncState: "error", offlineReady: true })
    );
    expect(recoverable.canStart).toBe(true);
    expect(
      recoverable.checks.find(candidate => candidate.id === "sync-health")
    ).toMatchObject({ status: "warning", blocksStart: false });

    const unsafe = evaluateSessionPreflight(
      readyInput({ syncState: "offline", offlineReady: false })
    );
    expect(unsafe.canStart).toBe(false);
    expect(unsafe.warningCount).toBe(1);
    expect(
      unsafe.checks.find(candidate => candidate.id === "sync-health")
    ).toMatchObject({ status: "blocked", blocksStart: true });
  });

  it("allows a temporary Firebase outage only with verified recovery", () => {
    const recoverable = evaluateSessionPreflight(
      readyInput({
        cloudAccess: "unavailable",
        syncState: "offline",
        offlineReady: true,
      })
    );
    expect(recoverable.canStart).toBe(true);
    expect(
      recoverable.checks.find(candidate => candidate.id === "tutor-access")
    ).toMatchObject({ status: "warning", blocksStart: false });

    const unsafe = evaluateSessionPreflight(
      readyInput({ cloudAccess: "unavailable", offlineReady: false })
    );
    expect(unsafe.canStart).toBe(false);
  });

  it("keeps checking and physical readiness states blocking", () => {
    const report = evaluateSessionPreflight(
      readyInput({
        authReady: false,
        syncState: "saving",
        timerReady: false,
        calculatorReady: false,
      })
    );

    expect(report.canStart).toBe(false);
    expect(report.blockingCount).toBe(4);
    expect(report.checks.map(candidate => candidate.status)).toEqual([
      "checking",
      "ready",
      "ready",
      "checking",
      "blocked",
      "blocked",
      "ready",
    ]);
  });
});
