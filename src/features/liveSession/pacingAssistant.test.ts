import { describe, expect, it } from "vitest";
import {
  calculateSessionPacing,
  deriveRecommendedDeckTarget,
} from "./pacingAssistant";

describe("calculateSessionPacing", () => {
  it("reports an on-pace 150-minute route using teaching time", () => {
    const result = calculateSessionPacing({
      sessionDurationMinutes: 150,
      elapsedMinutes: 60,
      totalRouteDecks: 45,
      currentDeck: 21,
      completedDecks: 20,
      breakAllowanceMinutes: 15,
    });

    expect(result.usableTeachingMinutes).toBe(135);
    expect(result.targetMinutesPerDeck).toBe(3);
    expect(result.averageMinutesPerCompletedDeck).toBe(3);
    expect(result.status).toBe("on-pace");
    expect(result.projectedFinishMinutes).toBe(135);
    expect(result.targetPaceRange).toEqual({
      fastestMinutesPerDeck: 2.7,
      slowestMinutesPerDeck: 3.3000000000000003,
    });
  });

  it("recognizes an ahead route and projects an early finish", () => {
    const result = calculateSessionPacing({
      sessionDurationMinutes: 120,
      elapsedMinutes: 30,
      totalRouteDecks: 36,
      currentDeck: 13,
      completedDecks: 12,
      breakAllowanceMinutes: 12,
    });

    expect(result.status).toBe("ahead");
    expect(result.deckDelta).toBe(2);
    expect(result.projectedFinishMinutes).toBe(90);
    expect(result.projectedOverrunMinutes).toBe(-18);
  });

  it("recognizes a behind route and projects the overrun", () => {
    const result = calculateSessionPacing({
      sessionDurationMinutes: 120,
      elapsedMinutes: 45,
      totalRouteDecks: 36,
      currentDeck: 11,
      completedDecks: 10,
      breakAllowanceMinutes: 12,
    });

    expect(result.status).toBe("behind");
    expect(result.deckDelta).toBe(-5);
    expect(result.projectedFinishMinutes).toBe(162);
    expect(result.projectedOverrunMinutes).toBe(54);
    expect(result.guidance).toMatch(/fast-pass secure material/i);
  });

  it("keeps the paused midpoint break outside the active teaching clock", () => {
    const result = calculateSessionPacing({
      sessionDurationMinutes: 150,
      elapsedMinutes: 67.5,
      totalRouteDecks: 45,
      currentDeck: 24,
      completedDecks: 23,
      breakAllowanceMinutes: 15,
    });

    expect(result.elapsedTeachingMinutes).toBe(67.5);
    expect(result.expectedCompletedDecks).toBe(22.5);
    expect(result.status).toBe("on-pace");
    expect(result.breakGuidance).toMatchObject({
      state: "due",
      scheduledElapsedMinutes: 67.5,
      minutesUntil: 0,
      remainingBreakMinutes: 15,
      recommendedAfterDeck: 23,
    });
  });

  it("returns the next quarter-route checkpoint", () => {
    const result = calculateSessionPacing({
      sessionDurationMinutes: 150,
      elapsedMinutes: 20,
      totalRouteDecks: 45,
      currentDeck: 7,
      completedDecks: 6,
      breakAllowanceMinutes: 15,
    });

    expect(result.nextCheckpoint).toEqual({
      targetCompletedDecks: 12,
      scheduledElapsedMinutes: 33.75,
      minutesUntil: 13.75,
      decksUntil: 6,
      state: "upcoming",
    });
  });

  it("marks a missed checkpoint overdue and uses the next incomplete target", () => {
    const result = calculateSessionPacing({
      sessionDurationMinutes: 120,
      elapsedMinutes: 65,
      totalRouteDecks: 36,
      currentDeck: 13,
      completedDecks: 12,
      breakAllowanceMinutes: 12,
    });

    expect(result.nextCheckpoint).toMatchObject({
      targetCompletedDecks: 18,
      scheduledElapsedMinutes: 54,
      minutesUntil: 0,
      state: "overdue",
    });
    expect(result.breakGuidance?.state).toBe("due");
  });

  it("uses target pace until the first deck has been completed", () => {
    const result = calculateSessionPacing({
      sessionDurationMinutes: 120,
      elapsedMinutes: 0,
      totalRouteDecks: 36,
      currentDeck: 1,
      completedDecks: 0,
    });

    expect(result.averageMinutesPerCompletedDeck).toBeNull();
    expect(result.projectedFinishMinutes).toBe(120);
    expect(result.status).toBe("on-pace");
    expect(result.breakGuidance).toBeNull();
  });

  it("finishes the projection at the actual elapsed time", () => {
    const result = calculateSessionPacing({
      sessionDurationMinutes: 150,
      elapsedMinutes: 132,
      totalRouteDecks: 45,
      currentDeck: 45,
      completedDecks: 45,
      breakAllowanceMinutes: 15,
    });

    expect(result.remainingDecks).toBe(0);
    expect(result.projectedFinishMinutes).toBe(132);
    expect(result.nextCheckpoint).toBeNull();
    expect(result.guidance).toMatch(/checkpoint target is complete/i);
  });

  it("supports the existing 180-minute intensive route", () => {
    const result = calculateSessionPacing({
      sessionDurationMinutes: 180,
      elapsedMinutes: 85,
      totalRouteDecks: 70,
      currentDeck: 35,
      completedDecks: 34,
      breakAllowanceMinutes: 5,
    });

    expect(result.targetMinutesPerDeck).toBe(2.5);
    expect(result.status).toBe("on-pace");
  });

  it("derives an ordered live target from authored deck timings", () => {
    expect(
      deriveRecommendedDeckTarget({
        sessionDurationMinutes: 120,
        expectedSeconds: Array.from({ length: 120 }, () => 150),
        breakAllowanceMinutes: 5,
      })
    ).toBe(46);
    expect(
      deriveRecommendedDeckTarget({
        sessionDurationMinutes: 150,
        expectedSeconds: Array.from({ length: 120 }, () => 150),
        breakAllowanceMinutes: 5,
      })
    ).toBe(58);
    expect(
      deriveRecommendedDeckTarget({
        sessionDurationMinutes: 180,
        expectedSeconds: Array.from({ length: 120 }, () => 150),
        breakAllowanceMinutes: 5,
      })
    ).toBe(70);
  });

  it("rejects unsupported durations and inconsistent deck counts", () => {
    expect(() =>
      calculateSessionPacing({
        sessionDurationMinutes: 119,
        elapsedMinutes: 0,
        totalRouteDecks: 36,
        currentDeck: 1,
        completedDecks: 0,
      })
    ).toThrow(/between 120 and 180/i);

    expect(() =>
      calculateSessionPacing({
        sessionDurationMinutes: 120,
        elapsedMinutes: 0,
        totalRouteDecks: 36,
        currentDeck: 37,
        completedDecks: 0,
      })
    ).toThrow(/identify a deck in the route/i);
  });
});
