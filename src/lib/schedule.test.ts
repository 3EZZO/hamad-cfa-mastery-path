import { describe, expect, it } from "vitest";
import {
  cascadeReschedule,
  getEffectiveSessions,
  restoreCanonicalScheduleFrom,
  validateEffectiveSessionSchedule,
} from "./schedule";

describe("safe session rescheduling", () => {
  it("uses the canonical plan when no overrides exist", () => {
    const sessions = getEffectiveSessions({});
    expect(sessions).toHaveLength(68);
    expect(sessions[0].effectiveDate).toBe("2026-08-26");
    expect(sessions.at(-1)?.effectiveDate).toBe("2027-02-26");
  });

  it("reflows only later collisions and preserves the exam buffer", () => {
    const result = cascadeReschedule(
      {},
      2,
      "2026-08-31",
      "Student travel",
      "2026-08-13T00:00:00.000Z",
    );
    expect(result.overrides["2"]?.date).toBe("2026-08-31");
    expect(result.overrides["3"]?.date).toBe("2026-09-02");
    expect(result.overrides["2"]?.reason).toBe("Student travel");
    expect(result.finalSessionDate).toBe("2027-02-26");
  });

  it("reports only effective dates that changed from the current schedule", () => {
    const currentOverrides = cascadeReschedule(
      {},
      2,
      "2026-08-31",
      "Student travel",
      "2026-08-13T00:00:00.000Z",
    ).overrides;
    const before = getEffectiveSessions(currentOverrides);
    const result = cascadeReschedule(
      currentOverrides,
      5,
      "2026-09-09",
      "Availability change",
      "2026-08-14T00:00:00.000Z",
    );
    const after = getEffectiveSessions(result.overrides);
    const actuallyChanged = before
      .filter(
        (entry, index) =>
          entry.effectiveDate !== after[index]?.effectiveDate,
      )
      .map((entry) => entry.session.number);

    expect(result.changedSessionNumbers).toEqual(actuallyChanged);
    expect(result.changedSessionNumbers).not.toContain(2);
  });

  it("preserves existing override reasons and timestamps when dates stay put", () => {
    const first = cascadeReschedule(
      {},
      2,
      "2026-08-31",
      "Original approved reason",
      "2026-08-13T00:00:00.000Z",
    );
    const repeated = cascadeReschedule(
      first.overrides,
      2,
      "2026-08-31",
      "Replacement reason that must not overwrite history",
      "2026-08-14T00:00:00.000Z",
    );

    expect(repeated.changedSessionNumbers).toEqual([]);
    expect(repeated.overrides).toEqual(first.overrides);
    expect(repeated.overrides["2"]).toMatchObject({
      reason: "Original approved reason",
      updatedAt: "2026-08-13T00:00:00.000Z",
    });
  });

  it("removes an override when a session returns to its canonical date", () => {
    const currentOverrides = {
      "2": {
        sessionNumber: 2,
        date: "2026-08-31",
        reason: "Travel",
        updatedAt: "2026-08-13T00:00:00.000Z",
      },
    };
    const result = cascadeReschedule(
      currentOverrides,
      2,
      "2026-08-29",
      "Restored",
      "2026-08-14T00:00:00.000Z",
    );

    expect(result.changedSessionNumbers).toContain(2);
    expect(result.overrides["2"]).toBeUndefined();
  });

  it("rejects invalid cadence dates, reversals, and exam-day collisions", () => {
    expect(() => cascadeReschedule({}, 2, "2026-08-30", "Sunday"))
      .toThrow(/Monday, Wednesday, or Saturday/);
    expect(() => cascadeReschedule({}, 2, "2026-08-24", "Too early"))
      .toThrow(/must remain after Session 01/);
    expect(() => cascadeReschedule({}, 68, "2027-02-27", "Exam day"))
      .toThrow(/before exam day/);
  });

  it("refuses a cascade when the remaining window has insufficient room", () => {
    expect(() => cascadeReschedule({}, 67, "2027-02-26", "Late delay"))
      .toThrow(/not enough room|exam day/i);
  });

  it("can restore the canonical schedule from a selected session", () => {
    const moved = cascadeReschedule({}, 2, "2026-08-31", "Travel").overrides;
    expect(restoreCanonicalScheduleFrom(moved, 3)).toEqual({ "2": moved["2"] });
    expect(restoreCanonicalScheduleFrom(moved, 2)).toEqual({});
  });

  it("validates a complete effective schedule and rejects capacity violations", () => {
    const valid = cascadeReschedule({}, 2, "2026-08-31", "Travel").overrides;
    expect(() => validateEffectiveSessionSchedule(valid)).not.toThrow();

    expect(() =>
      validateEffectiveSessionSchedule({
        "2": {
          sessionNumber: 2,
          date: "2026-08-31",
          reason: "Move",
          updatedAt: "2026-08-13T00:00:00.000Z",
        },
        "3": {
          sessionNumber: 3,
          date: "2026-09-02",
          reason: "Move",
          updatedAt: "2026-08-13T00:00:00.000Z",
        },
        "4": {
          sessionNumber: 4,
          date: "2026-09-05",
          reason: "Move",
          updatedAt: "2026-08-13T00:00:00.000Z",
        },
      }),
    ).toThrow(/more than three|strict chronological order/i);
  });
});
