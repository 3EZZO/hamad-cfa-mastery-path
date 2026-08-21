import { describe, expect, it } from "vitest";
import { PLAN, getPlanTasks } from "../data/plan";
import { createDefaultState } from "./storage";
import { getTaskStatus, isTaskComplete } from "./taskStatus";

describe("task completion approval", () => {
  it("keeps sessions incomplete until a matching tutor review approves them", () => {
    const state = createDefaultState();
    const session = getPlanTasks(PLAN[0]!).find(
      (task) => task.kind === "session",
    )!;
    state.taskCompletions[session.id] = true;
    expect(isTaskComplete(session, state)).toBe(false);
    state.sessionCompletionRequests[session.id] = {
      taskId: session.id,
      requestedAt: "2026-08-19T10:00:00.000Z",
    };
    expect(getTaskStatus(session, state)).toBe("requested");
    state.sessionCompletionReviews[session.id] = {
      taskId: session.id,
      requestedAt: "2026-08-19T10:00:00.000Z",
      status: "approved",
      reviewedAt: "2026-08-19T11:00:00.000Z",
      note: "",
    };
    expect(getTaskStatus(session, state)).toBe("approved");
    expect(isTaskComplete(session, state)).toBe(true);
  });

  it("lets independent work use the ordinary student completion flag", () => {
    const state = createDefaultState();
    const independent = getPlanTasks(PLAN[0]!).find((task) => task.kind === "independent")!;
    state.taskCompletions[independent.id] = true;
    expect(getTaskStatus(independent, state)).toBe("complete");
  });
});
