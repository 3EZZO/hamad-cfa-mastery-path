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
    state.sessionCompletionRequests["w2-session-1"] = {
      taskId: "w2-session-1",
      requestedAt: "2026-09-19T08:00:00.000Z",
    };
    state.sessionCompletionReviews["w2-session-1"] = {
      taskId: "w2-session-1",
      requestedAt: "2026-09-19T08:00:00.000Z",
      reviewedAt: "2026-09-19T09:00:00.000Z",
      status: "approved",
      note: "Evidence reviewed.",
    };
    state.practiceLogs.push({
      id: "p1", date: "2026-09-17", topic: "Quantitative Methods",
      attempted: 40, correct: 30, source: "LES", note: "Baseline", confidence: 3,
    });
    const report = buildWeeklyReport(PLAN[1], state, "2026-09-19");
    expect(report.week).toBe(2);
    expect(report.completedTasks).toBe(1);
    expect(report.practiceAttempted).toBe(40);
    expect(report.practiceAccuracy).toBe(75);
  });

  it("formats a WhatsApp-friendly summary and printable one-page document", () => {
    const report = buildWeeklyReport(PLAN[0], createDefaultState(), "2026-08-20");
    expect(formatWeeklyReportText(report)).toContain(
      "HAMAD CFA MASTERY - WEEK 01 REPORT",
    );
    const html = createWeeklyReportHtml(report);
    expect(html).toContain("<!doctype html>");
    expect(html).toContain("Prepared for Hamad Al Sagheer");
  });

  it("prints through a hidden iframe and removes it after printing", () => {
    vi.useFakeTimers();
    const report = buildWeeklyReport(
      PLAN[0],
      createDefaultState(),
      "2026-08-20",
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

  it("waits for the report's fonts before printing, but never longer than the cap", async () => {
    vi.useFakeTimers();
    const report = buildWeeklyReport(PLAN[0], createDefaultState(), "2026-08-20");
    const makeFrame = (ready: Promise<unknown>) => {
      const print = vi.fn();
      const reportDocument = { open: vi.fn(), write: vi.fn(), close: vi.fn(), fonts: { ready } } as unknown as Document;
      const reportWindow = { document: reportDocument, focus: vi.fn(), print, addEventListener: vi.fn() } as unknown as Window;
      const frame = {
        title: "", setAttribute: vi.fn(), style: { cssText: "" }, contentWindow: reportWindow, contentDocument: reportDocument, remove: vi.fn(),
      } as unknown as HTMLIFrameElement;
      vi.stubGlobal("document", { createElement: vi.fn(() => frame), body: { appendChild: vi.fn() } });
      vi.stubGlobal("window", { setTimeout: globalThis.setTimeout, clearTimeout: globalThis.clearTimeout });
      return print;
    };

    let loaded: () => void = () => undefined;
    const print = makeFrame(new Promise<void>((resolve) => { loaded = resolve; }));
    printWeeklyReport(report);
    vi.advanceTimersByTime(0);
    expect(print).not.toHaveBeenCalled();
    loaded();
    await Promise.resolve();
    await Promise.resolve();
    expect(print).toHaveBeenCalledOnce();
    vi.advanceTimersByTime(1_500);
    expect(print).toHaveBeenCalledOnce();

    const stalled = makeFrame(new Promise(() => undefined));
    printWeeklyReport(report);
    vi.advanceTimersByTime(1_499);
    expect(stalled).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(stalled).toHaveBeenCalledOnce();
  });
});
