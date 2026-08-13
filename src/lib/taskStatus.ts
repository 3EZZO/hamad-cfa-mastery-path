import type { PlanTask, TrackerState } from "../types";

export type TaskStatus =
  | "incomplete"
  | "complete"
  | "requested"
  | "approved"
  | "returned";

export function getTaskStatus(task: PlanTask, tracker: TrackerState): TaskStatus {
  if (task.kind !== "session") {
    return tracker.taskCompletions[task.id] ? "complete" : "incomplete";
  }
  const request = tracker.sessionCompletionRequests[task.id];
  const review = tracker.sessionCompletionReviews[task.id];
  if (request && review?.requestedAt === request.requestedAt) {
    return review.status;
  }
  return request ? "requested" : "incomplete";
}

export function isTaskComplete(task: PlanTask, tracker: TrackerState): boolean {
  const status = getTaskStatus(task, tracker);
  return status === "complete" || status === "approved";
}
