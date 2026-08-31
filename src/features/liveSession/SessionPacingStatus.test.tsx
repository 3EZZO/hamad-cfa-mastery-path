import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { PacingAssistantResult, PacingStatus } from "./pacingAssistant";
import { SessionPacingStatus } from "./SessionPacingStatus";

function pacing(
  status: PacingStatus,
  overrides: Partial<PacingAssistantResult> = {}
): PacingAssistantResult {
  return {
    usableTeachingMinutes: 135,
    breakAllowanceMinutes: 15,
    elapsedTeachingMinutes: 60,
    remainingDecks: 25,
    averageMinutesPerCompletedDeck: 3,
    targetMinutesPerDeck: 3,
    targetPaceRange: {
      fastestMinutesPerDeck: 2.7,
      slowestMinutesPerDeck: 3.3,
    },
    expectedCompletedDecks: 20,
    deckDelta: 0,
    status,
    projectedFinishMinutes: 150,
    projectedOverrunMinutes: 0,
    nextCheckpoint: {
      targetCompletedDecks: 23,
      scheduledElapsedMinutes: 67.5,
      minutesUntil: 7.5,
      decksUntil: 3,
      state: "upcoming",
    },
    breakGuidance: {
      recommendedAfterDeck: 23,
      scheduledElapsedMinutes: 67.5,
      minutesUntil: 7.5,
      remainingBreakMinutes: 15,
      state: "upcoming",
    },
    guidance: "On pace.",
    ...overrides,
  };
}

describe("SessionPacingStatus", () => {
  it("renders an accessible calibrating state before pace is known", () => {
    const html = renderToStaticMarkup(
      <SessionPacingStatus pacing={null} completedDecks={0} targetDecks={45} />
    );

    expect(html).toContain('role="status"');
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain('data-pacing-state="calibrating"');
    expect(html).toContain("Calibrating pace");
    expect(html).toContain("0/45");
  });

  it("gives paused state precedence without changing the pace result", () => {
    const html = renderToStaticMarkup(
      <SessionPacingStatus
        pacing={pacing("ahead", { deckDelta: 3 })}
        completedDecks={12}
        targetDecks={45}
        paused
      />
    );

    expect(html).toContain('data-pacing-state="paused"');
    expect(html).toContain("Pace paused");
    expect(html).not.toContain("Ahead 3 decks");
  });

  it.each([
    ["ahead", 2.2, "Ahead 2 decks"],
    ["on-pace", 0, "On pace"],
    ["behind", -4.6, "Behind 5 decks"],
  ] as const)("renders the %s rail state", (status, deckDelta, copy) => {
    const html = renderToStaticMarkup(
      <SessionPacingStatus
        pacing={pacing(status, { deckDelta })}
        completedDecks={20}
        targetDecks={45}
      />
    );

    expect(html).toContain(`data-pacing-state="${status}"`);
    expect(html).toContain(copy);
    expect(html).toContain("Teaching finish near 150 min");
  });

  it("shows overrun, checkpoint, pace range, and break in optional details", () => {
    const html = renderToStaticMarkup(
      <SessionPacingStatus
        pacing={pacing("behind", {
          deckDelta: -3,
          projectedFinishMinutes: 164.2,
          projectedOverrunMinutes: 14.2,
        })}
        completedDecks={17}
        targetDecks={45}
        showDetails
      />
    );

    expect(html).toContain("+15 teaching min");
    expect(html).toContain("3.0 min/deck - target 2.7-3.3");
    expect(html).toContain("Checkpoint 23 by minute 68");
    expect(html).toContain("Break in 8 min");
    expect(html).toContain(
      "Behind 3 decks. 17 of 45 live-target decks complete"
    );
  });

  it("renders completion ahead of paused or pace states", () => {
    const html = renderToStaticMarkup(
      <SessionPacingStatus
        pacing={pacing("behind", { deckDelta: -2 })}
        completedDecks={45}
        targetDecks={45}
        paused
      />
    );

    expect(html).toContain('data-pacing-state="complete"');
    expect(html).toContain("Live target complete");
    expect(html).not.toContain("Pace paused");
    expect(html).not.toContain("projected");
  });
});
