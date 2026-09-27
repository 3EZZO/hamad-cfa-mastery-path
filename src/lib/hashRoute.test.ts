import { describe, expect, it, vi } from "vitest";
import {
  buildHash,
  parseHash,
  parseSessionSegment,
  parseWeekSegment,
  readSegment,
  resolveLegacyRoute,
  sessionSegment,
  weekSegment,
  writeSegment,
} from "./hashRoute";

describe("hash route grammar", () => {
  it("splits tab and segment and drops malformed segments", () => {
    expect(parseHash("")).toEqual({ tab: "", segment: "" });
    expect(parseHash("#weekly")).toEqual({ tab: "weekly", segment: "" });
    expect(parseHash("#weekly/week-7")).toEqual({ tab: "weekly", segment: "week-7" });
    expect(parseHash("weekly/week-7")).toEqual({ tab: "weekly", segment: "week-7" });
    expect(parseHash("#live/session-03/extra")).toEqual({ tab: "live", segment: "" });
    expect(parseHash("#practice/<script>")).toEqual({ tab: "practice", segment: "" });
    expect(parseHash("#practice/")).toEqual({ tab: "practice", segment: "" });
  });

  it("builds hashes and round-trips week and session segments", () => {
    expect(buildHash("weekly")).toBe("#weekly");
    expect(buildHash("weekly", "week-7")).toBe("#weekly/week-7");
    expect(buildHash("weekly", "bad segment")).toBe("#weekly");
    expect(weekSegment(7)).toBe("week-7");
    expect(parseWeekSegment("week-7", 25)).toBe(7);
    expect(parseWeekSegment("week-26", 25)).toBeNull();
    expect(parseWeekSegment("week-0", 25)).toBeNull();
    expect(parseWeekSegment("quick5", 25)).toBeNull();
    expect(sessionSegment(3)).toBe("session-03");
    expect(parseSessionSegment("session-03")).toBe(3);
    expect(parseSessionSegment("session-12")).toBe(12);
    expect(parseSessionSegment("session-x")).toBeNull();
  });

  it("reads a segment only for the matching tab", () => {
    const win = { location: { hash: "#weekly/week-4" } };
    expect(readSegment("weekly", win)).toBe("week-4");
    expect(readSegment("roadmap", win)).toBe("");
    expect(readSegment("weekly", undefined)).toBe("");
  });

  it("rewrites the segment in place without a history entry", () => {
    const replaceState = vi.fn();
    const win = { location: { hash: "#weekly" }, history: { replaceState } };
    writeSegment("weekly", "week-4", win);
    expect(replaceState).toHaveBeenCalledWith(null, "", "#weekly/week-4");

    // Same value: nothing written. Other tab active: nothing written.
    replaceState.mockClear();
    win.location.hash = "#weekly/week-4";
    writeSegment("weekly", "week-4", win);
    win.location.hash = "#dashboard";
    writeSegment("weekly", "week-5", win);
    expect(replaceState).not.toHaveBeenCalled();

    // Clearing a segment and falling back to the hash without history.
    const plain = { location: { hash: "#live/session-02" } };
    writeSegment("live", "", plain);
    expect(plain.location.hash).toBe("#live");
    writeSegment("live", "session-03", undefined);
  });
});

describe("legacy routes", () => {
  const moved = (hash: string) => {
    const next = resolveLegacyRoute(parseHash(hash));
    return next ? buildHash(next.tab, next.segment) : null;
  };

  it("maps every retired tab, keeping its sub-route", () => {
    expect(moved("#weekly")).toBe("#plan");
    expect(moved("#weekly/week-7")).toBe("#plan/week-7");
    expect(moved("#roadmap")).toBe("#plan/roadmap");
    expect(moved("#roadmap/week-12")).toBe("#plan/roadmap-week-12");
    expect(moved("#sessions")).toBe("#plan/sessions");
    expect(moved("#mastery")).toBe("#progress/topics");
    expect(moved("#mocks")).toBe("#progress/mocks");
    expect(moved("#moduleMocks")).toBe("#practice/tests");
    expect(moved("#moduleMocks/m01-rates-and-returns")).toBe("#practice/tests-m01-rates-and-returns");
    expect(moved("#errors")).toBe("#practice/mistakes");
  });

  it("leaves tabs that still exist, unknown tabs and prototype keys alone", () => {
    for (const tab of ["dashboard", "practice", "notes", "live", "coach", "payments", "plan", "progress", "nope", "toString", "__proto__"]) {
      expect(resolveLegacyRoute({ tab, segment: "" })).toBeNull();
    }
  });
});
