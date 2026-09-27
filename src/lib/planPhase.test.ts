import { describe, expect, it } from "vitest";
import { PLAN } from "../data/plan";
import { createDefaultState } from "./storage";
import { getPlanPhase, mockCampaignStatus } from "./planPhase";

describe("getPlanPhase", () => {
  it("follows the plan's phase boundaries", () => {
    expect(getPlanPhase(0)).toBe("pre");
    expect(getPlanPhase(1)).toBe("coverage");
    expect(getPlanPhase(16)).toBe("coverage");
    expect(getPlanPhase(17)).toBe("integration");
    expect(getPlanPhase(18)).toBe("mock");
    expect(getPlanPhase(24)).toBe("mock");
    expect(getPlanPhase(25)).toBe("taper");
    expect(getPlanPhase(PLAN.length + 1)).toBe("post");
  });
});

describe("mockCampaignStatus", () => {
  it("points at the first planned mock before any is recorded", () => {
    const status = mockCampaignStatus(createDefaultState(), 18);
    expect(status.nextMock).toMatchObject({ label: "Mock 1", target: 60, week: 19 });
    expect(status.latest).toBeNull();
    expect(status.weakSections).toEqual([]);
  });

  it("moves on once a mock is recorded and flags its weak sections", () => {
    const tracker = createDefaultState();
    tracker.mockScores = [{
      id: "m1", date: "2027-01-15", label: "Mock 1", score: 58, note: "", milestoneWeek: 19,
      sections: [
        { topic: "Fixed Income", attempted: 20, correct: 8 },
        { topic: "Ethical and Professional Standards", attempted: 30, correct: 24 },
      ],
    }];
    const status = mockCampaignStatus(tracker, 19);
    expect(status.nextMock).toMatchObject({ label: "Mock 2", week: 20 });
    expect(status.latest).toEqual({ label: "Mock 1", score: 58, date: "2027-01-15", target: 60 });
    expect(status.weakSections.map((section) => section.topic)).toEqual(["Fixed Income"]);
  });

  it("matches a mock by label when no week was recorded", () => {
    const tracker = createDefaultState();
    tracker.mockScores = [{ id: "m1", date: "2027-01-15", label: "mock 1", score: 64, note: "" }];
    expect(mockCampaignStatus(tracker, 19).latest?.target).toBe(60);
  });
});
