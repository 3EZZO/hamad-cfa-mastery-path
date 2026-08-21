import { describe, expect, it } from "vitest";
import {
  cascadeReschedule,
  getEffectiveSessions,
  restoreCanonicalSession,
  validateEffectiveSessionSchedule,
} from "./schedule";

describe("fixed weekly checkpoint scheduling", () => {
  it("uses 26 canonical Saturdays before exam week", () => {
    const sessions = getEffectiveSessions({});
    expect(sessions).toHaveLength(26);
    expect(sessions[0]?.effectiveDate).toBe("2026-08-29");
    expect(sessions.at(-1)?.effectiveDate).toBe("2027-02-20");
    expect(sessions.every((entry) => entry.session.day === "Saturday")).toBe(
      true,
    );
  });

  it("allows only the immediately preceding Friday as an exception", () => {
    const result = cascadeReschedule(
      {},
      2,
      "2026-09-04",
      "Student travel",
      "2026-08-21T00:00:00.000Z",
    );
    expect(result.changedSessionNumbers).toEqual([2]);
    expect(result.overrides["2"]).toEqual({
      sessionNumber: 2,
      date: "2026-09-04",
      reason: "Student travel",
      updatedAt: "2026-08-21T00:00:00.000Z",
    });
    expect(result.finalSessionDate).toBe("2027-02-20");
    expect(getEffectiveSessions(result.overrides)[2]?.effectiveDate).toBe(
      "2026-09-12",
    );
  });

  it("does not rewrite audit history when the effective date is unchanged", () => {
    const first = cascadeReschedule(
      {},
      2,
      "2026-09-04",
      "Original approved reason",
      "2026-08-21T00:00:00.000Z",
    );
    const repeated = cascadeReschedule(
      first.overrides,
      2,
      "2026-09-04",
      "Replacement reason",
      "2026-08-22T00:00:00.000Z",
    );
    expect(repeated.changedSessionNumbers).toEqual([]);
    expect(repeated.overrides).toEqual(first.overrides);
  });

  it("removes an override when the checkpoint returns to Saturday", () => {
    const moved = cascadeReschedule(
      {},
      2,
      "2026-09-04",
      "Travel",
    );
    const restored = cascadeReschedule(
      moved.overrides,
      2,
      "2026-09-05",
      "Restored",
    );
    expect(restored.changedSessionNumbers).toEqual([2]);
    expect(restored.overrides["2"]).toBeUndefined();
  });

  it("rejects other weekdays, other Saturdays, and exam day", () => {
    expect(() => cascadeReschedule({}, 2, "2026-09-03", "Thursday"))
      .toThrow(/planned Saturday|preceding Friday/i);
    expect(() => cascadeReschedule({}, 2, "2026-09-12", "Wrong week"))
      .toThrow(/planned Saturday|preceding Friday/i);
    expect(() => cascadeReschedule({}, 26, "2027-02-27", "Exam day"))
      .toThrow(/before exam day/i);
  });

  it("restores only the selected checkpoint to its canonical Saturday", () => {
    const first = cascadeReschedule({}, 2, "2026-09-04", "Travel").overrides;
    const second = cascadeReschedule(
      first,
      4,
      "2026-09-18",
      "Travel",
    ).overrides;
    expect(restoreCanonicalSession(second, 4)).toEqual({ "2": second["2"] });
    expect(restoreCanonicalSession(second, 2)).toEqual({ "4": second["4"] });
  });

  it("validates the complete effective schedule", () => {
    const valid = cascadeReschedule({}, 2, "2026-09-04", "Travel").overrides;
    expect(() => validateEffectiveSessionSchedule(valid)).not.toThrow();
    expect(() =>
      validateEffectiveSessionSchedule({
        "2": {
          sessionNumber: 2,
          date: "2026-08-28",
          reason: "Wrong week",
          updatedAt: "2026-08-21T00:00:00.000Z",
        },
      }),
    ).toThrow(/planned Saturday|preceding Friday/i);
  });
});
