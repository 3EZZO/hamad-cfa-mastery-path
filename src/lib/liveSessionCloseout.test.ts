import { describe, expect, it } from "vitest";
import { createDefaultState } from "./storage";
import {
  applyLiveSessionCloseout,
  buildLiveSessionPrivateNote,
} from "./liveSessionCloseout";
import type { LiveSessionCloseoutResult } from "../features/liveSession";

const result: LiveSessionCloseoutResult = {
  sessionId: "session-01-2026-09-05",
  routeId: "standard-150",
  actualMinutes: 148,
  evidence: [
    {
      id: "e-1",
      stageId: "returns",
      targetId: "q-1",
      targetLabel: "Holding-period return",
      verdict: "repair",
      confidence: 4,
      errorCodes: ["T", "I"],
      note: "Placed the dividend after the terminal value.",
      recordedAt: "2026-09-05T07:10:00.000Z",
    },
    {
      id: "e-2",
      stageId: "returns",
      targetId: "q-2",
      targetLabel: "Geometric mean",
      verdict: "correct",
      confidence: 5,
      errorCodes: [],
      note: "",
      recordedAt: "2026-09-05T07:20:00.000Z",
    },
  ],
  mastery: [
    { stageId: "returns", stageTitle: "Returns", decision: "amber" },
    { stageId: "tvm", stageTitle: "Time value", decision: "green" },
  ],
  outcome: "Hamad can choose and interpret the core return measures.",
  nextAction: "Complete the assigned mixed set.",
  homework: "Twenty mixed questions.",
  delayedRetest: "Retest the timeline question next Saturday.",
  privateTutorNote: "Keep the next opener focused on cash-flow timing.",
  completedAt: "2026-09-05T08:30:00.000Z",
};

describe("applyLiveSessionCloseout", () => {
  it("records an approved session, evidence, mastery, and repair without duplicates", () => {
    const initial = createDefaultState();
    const options = {
      tracker: initial,
      result,
      sessionNumber: 1,
      week: 1,
      date: "2026-09-05",
      title: "Quant Masterclass I",
      taskId: "w1-session-1",
    };
    const first = applyLiveSessionCloseout(options);
    const second = applyLiveSessionCloseout({ ...options, tracker: first });

    expect(second.taskCompletions["w1-session-1"]).toBe(true);
    expect(second.sessionCompletionReviews["w1-session-1"]?.status).toBe("approved");
    expect(second.sessionLogs).toHaveLength(1);
    expect(second.practiceLogs).toHaveLength(1);
    expect(second.practiceLogs[0]).toMatchObject({ attempted: 2, correct: 1 });
    expect(second.errorEntries).toHaveLength(1);
    expect(second.errorEntries[0]).toMatchObject({
      category: "Reading error",
      revisitDate: "2026-09-12",
    });
    expect(second.topicMastery["Quantitative Methods"]).toBe(78);
  });

  it("builds a deterministic private note only when the tutor wrote one", () => {
    expect(buildLiveSessionPrivateNote(result, "2026-09-05")).toMatchObject({
      id: "session-01-2026-09-05-private-note",
      date: "2026-09-05",
    });
    expect(
      buildLiveSessionPrivateNote(
        { ...result, privateTutorNote: "   " },
        "2026-09-05",
      ),
    ).toBeNull();
  });
});
