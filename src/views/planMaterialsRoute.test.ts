import { describe, expect, it } from "vitest";
import { buildHash, parseHash, resolveLegacyRoute } from "../lib/hashRoute";
import { materialSegment, parsePlanSegment, planSegment } from "./PlanView";

const VERSION = `r10-simple-linear-regression-${"c".repeat(64)}`;

describe("Plan › Session materials routes", () => {
  it("round-trips the list and a single shared document through the hash", () => {
    expect(planSegment("materials")).toBe("materials");
    expect(materialSegment(null)).toBe("materials");
    expect(materialSegment(VERSION)).toBe(`material-${VERSION}`);
    const hash = buildHash("plan", materialSegment(VERSION));
    expect(parseHash(hash)).toEqual({ tab: "plan", segment: `material-${VERSION}` });
    expect(parsePlanSegment(parseHash(hash).segment)).toEqual({ section: "materials", week: null, materialVersionId: VERSION });
    expect(parsePlanSegment("materials")).toEqual({ section: "materials", week: null, materialVersionId: null });
  });

  it("fails safely for malformed material ids without fetching anything", () => {
    expect(parsePlanSegment("material-not-a-version")).toMatchObject({ section: "materials", materialVersionId: null, invalidMaterial: true });
    expect(materialSegment("../../etc")).toBe("materials");
    expect(parseHash("#plan/material-../x").segment).toBe("");
  });

  it("keeps existing plan routes and legacy bookmarks unchanged", () => {
    expect(parsePlanSegment("")).toEqual({ section: "week", week: null });
    expect(parsePlanSegment("week-7")).toEqual({ section: "week", week: 7 });
    expect(parsePlanSegment("sessions")).toEqual({ section: "sessions", week: null });
    expect(parsePlanSegment("roadmap-week-18")).toEqual({ section: "roadmap", week: 18 });
    expect(resolveLegacyRoute({ tab: "sessions", segment: "" })).toEqual({ tab: "plan", segment: "sessions" });
    expect(parseHash("#live/session-03")).toEqual({ tab: "live", segment: "session-03" });
  });
});
