import { afterEach, describe, expect, it, vi } from "vitest";
import { PLAN } from "../data/plan";
import { createDefaultState } from "./storage";
import {
  buildWeeklyReport,
  createWeeklyReportHtml,
  formatWeeklyReportText,
  printWeeklyReport,
} from "./weeklyReport";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("weekly report generator", () => {
  it("summarizes the selected week without storing a report blob", () => {
    const state = createDefaultState();
    state.sessionCompletionRequests["w1-session-1"] = {
      taskId: "w1-session-1",
      requestedAt: "2026-08-26T08:00:00.000Z",
    };
    state.sessionCompletionReviews["w1-session-1"] = {
      taskId: "w1-session-1",
      requestedAt: "2026-08-26T08:00:00.000Z",
      reviewedAt: "2026-08-26T09:00:00.000Z",
      status: "approved",
      note: "Evidence reviewed.",
    };
    state.practiceLogs.push({
      id: "p1", date: "2026-08-27", topic: "Quantitative Methods",
      attempted: 40, correct: 30, source: "LES", note: "Baseline", confidence: 3,
    });
    const report = buildWeeklyReport(PLAN[0], state, "2026-08-29");
    expect(report.week).toBe(1);
    expect(report.completedTasks).toBe(1);
    expect(report.practiceAttempted).toBe(40);
    expect(report.practiceAccuracy).toBe(75);
  });

  it("formats a WhatsApp-friendly summary and printable one-page document", () => {
    const report = buildWeeklyReport(PLAN[0], createDefaultState(), "2026-08-13");
    expect(formatWeeklyReportText(report)).toContain("PROJECT 202 - WEEK 01 REPORT");
    const html = createWeeklyReportHtml(report);
    expect(html).toContain("<!doctype html>");
    expect(html).toContain("Prepared for Hamad Al Sagheer");
  });

  it("prints through a hidden iframe and removes it after printing", () => {
    vi.useFakeTimers();
    const report = buildWeeklyReport(
      PLAN[0],
      createDefaultState(),
      "2026-08-13",
    );
    const write = vi.fn();
    const remove = vi.fn();
    const appendChild = vi.fn();
    const focus = vi.fn();
    const print = vi.fn();
    let afterPrint: (() => void) | undefined;
    const reportDocument = {
      open: vi.fn(),
      write,
      close: vi.fn(),
    } as unknown as Document;
    const reportWindow = {
      document: reportDocument,
      focus,
      print,
      addEventListener: vi.fn((event: string, listener: () => void) => {
        if (event === "afterprint") afterPrint = listener;
      }),
    } as unknown as Window;
    const frame = {
      title: "",
      setAttribute: vi.fn(),
      style: { cssText: "" },
      contentWindow: reportWindow,
      contentDocument: reportDocument,
      remove,
    } as unknown as HTMLIFrameElement;

    vi.stubGlobal("document", {
      createElement: vi.fn(() => frame),
      body: { appendChild },
    });
    vi.stubGlobal("window", {
      setTimeout: globalThis.setTimeout,
      clearTimeout: globalThis.clearTimeout,
    });

    printWeeklyReport(report);
    expect(appendChild).toHaveBeenCalledWith(frame);
    expect(write).toHaveBeenCalledWith(expect.stringContaining("<!doctype html>"));
    expect(print).not.toHaveBeenCalled();

    vi.advanceTimersByTime(0);
    expect(focus).toHaveBeenCalledOnce();
    expect(print).toHaveBeenCalledOnce();
    expect(remove).not.toHaveBeenCalled();

    afterPrint?.();
    expect(remove).toHaveBeenCalledOnce();
    vi.advanceTimersByTime(60_000);
    expect(remove).toHaveBeenCalledOnce();
  });
});
