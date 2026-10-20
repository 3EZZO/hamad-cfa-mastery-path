import { describe, expect, it } from "vitest";
import { createDefaultState } from "./storage";
import { applyPdfSessionRecord, pdfSessionLogId, PDF_SESSION_LOG_TYPE } from "./pdfSessionRecord";

const base = {
  sessionNumber: 3, week: 3, date: "2026-10-20", title: "Economics I", taskId: "w3-s3",
  durationMinutes: 86.6, outcome: "  Taught Fiscal Policy pp. 1–14.  ", nextAction: "Review pp. 15–20.",
  recordedAt: "2026-10-20T18:00:00.000Z",
};

describe("Teach from PDF session record", () => {
  it("writes one session log and leaves mastery, practice and errors alone", () => {
    const tracker = { ...createDefaultState(), topicMastery: { Economics: 60 } };
    const next = applyPdfSessionRecord({ ...base, tracker, completeTask: false });
    expect(next.sessionLogs[0]).toEqual({
      id: pdfSessionLogId(3), date: "2026-10-20", sessionNumber: 3, week: 3, type: PDF_SESSION_LOG_TYPE,
      durationMinutes: 87, focus: "Economics I", outcome: "Taught Fiscal Policy pp. 1–14.", nextAction: "Review pp. 15–20.",
    });
    expect(next.topicMastery).toEqual({ Economics: 60 });
    expect(next.practiceLogs).toBe(tracker.practiceLogs);
    expect(next.errorEntries).toBe(tracker.errorEntries);
    expect(next.taskCompletions).toBe(tracker.taskCompletions);
  });

  it("replaces its own log when recorded again and keeps other logs", () => {
    const other = { id: "other", date: "2026-10-01", sessionNumber: 2, week: 2, type: "x", durationMinutes: 1, focus: "", outcome: "", nextAction: "" };
    const once = applyPdfSessionRecord({ ...base, tracker: { ...createDefaultState(), sessionLogs: [other] }, completeTask: false });
    const twice = applyPdfSessionRecord({ ...base, tracker: once, outcome: "Updated", completeTask: false });
    expect(twice.sessionLogs.map(log => log.id)).toEqual([pdfSessionLogId(3), "other"]);
    expect(twice.sessionLogs[0]!.outcome).toBe("Updated");
  });

  it("approves the session task only when chosen", () => {
    const tracker = { ...createDefaultState(), sessionCompletionRequests: { "w3-s3": { taskId: "w3-s3", requestedAt: "2026-10-19T10:00:00.000Z" } } } as never;
    const next = applyPdfSessionRecord({ ...base, tracker, completeTask: true });
    expect(next.taskCompletions["w3-s3"]).toBe(true);
    expect(next.sessionCompletionRequests["w3-s3"]).toBeUndefined();
    expect(next.sessionCompletionReviews["w3-s3"]).toMatchObject({ status: "approved", requestedAt: "2026-10-19T10:00:00.000Z", reviewedAt: base.recordedAt });
  });
});
