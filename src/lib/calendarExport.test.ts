import { afterEach, describe, expect, it, vi } from "vitest";
import program from "../data/program.json";
import {
  createProject202Calendar,
  downloadProject202Calendar,
  getProject202CalendarEvents,
} from "./calendarExport";

const FIXED_GENERATED_AT = new Date("2026-08-13T05:30:45.000Z");

function unfold(calendar: string): string {
  return calendar.replace(/\r\n[ \t]/g, "");
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("Project 202 calendar export", () => {
  it("exports every tutor session and administrative milestone", () => {
    const events = getProject202CalendarEvents();
    const sessions = events.filter((event) => event.kind === "tutor-session");
    const milestones = events.filter(
      (event) => event.kind === "administrative-milestone",
    );

    expect(sessions).toHaveLength(program.tutoringRhythm.totalSessions);
    expect(milestones).toHaveLength(program.administrativeMilestones.length);
    expect(sessions[0]).toMatchObject({
      uid: "project-202-session-01@project-202-tracker",
      startDate: program.firstTutorSession,
      summary: expect.stringContaining("Session 01"),
    });
    expect(sessions.at(-1)).toMatchObject({
      uid: "project-202-session-68@project-202-tracker",
      startDate: "2027-02-26",
    });
    expect(new Set(events.map((event) => event.uid)).size).toBe(events.length);
  });

  it("builds an RFC 5545 document with deterministic metadata", () => {
    const calendar = createProject202Calendar({
      generatedAt: FIXED_GENERATED_AT,
    });
    const unfolded = unfold(calendar);
    const expectedEvents =
      program.tutoringRhythm.totalSessions +
      program.administrativeMilestones.length;

    expect(calendar.startsWith("BEGIN:VCALENDAR\r\nVERSION:2.0\r\n")).toBe(
      true,
    );
    expect(calendar.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(unfolded.match(/BEGIN:VEVENT/g)).toHaveLength(expectedEvents);
    expect(unfolded.match(/END:VEVENT/g)).toHaveLength(expectedEvents);
    expect(unfolded).toContain("DTSTAMP:20260813T053045Z");
    expect(unfolded).toContain(
      `DTSTART;VALUE=DATE:${program.firstTutorSession.replaceAll("-", "")}`,
    );
    expect(unfolded).toContain("DTEND;VALUE=DATE:20260820");
    expect(unfolded).toContain("Project 202 - Hamad's CFA Level I Plan");
  });

  it("uses only CRLF separators and folds every physical line to 75 octets", () => {
    const calendar = createProject202Calendar({
      generatedAt: FIXED_GENERATED_AT,
    });
    const withoutCrlf = calendar.replace(/\r\n/g, "");
    const encoder = new TextEncoder();

    expect(withoutCrlf).not.toMatch(/[\r\n]/);
    for (const line of calendar.split("\r\n").filter(Boolean)) {
      expect(encoder.encode(line).length).toBeLessThanOrEqual(75);
    }
  });

  it("escapes TEXT punctuation and preserves intentional description breaks", () => {
    const unfolded = unfold(
      createProject202Calendar({ generatedAt: FIXED_GENERATED_AT }),
    );

    expect(unfolded).toContain(
      "SUMMARY:Project 202 - Session 25: CAPM\\, market model\\, factor models\\, and Equity integration",
    );
    expect(unfolded).toMatch(
      /DESCRIPTION:Session 01 of 68\\nWeek 01 - .*\\nRhythm:/,
    );
  });

  it("includes each named administrative milestone as a transparent event", () => {
    const events = getProject202CalendarEvents();
    const milestones = events.filter(
      (event) => event.kind === "administrative-milestone",
    );

    expect(milestones.map((event) => event.startDate)).toEqual(
      program.administrativeMilestones.map((milestone) => milestone.date),
    );
    expect(milestones.every((event) => event.transparent)).toBe(true);
    expect(
      milestones.some((event) =>
        event.summary.includes("Hamad's exam appointment"),
      ),
    ).toBe(true);
  });

  it("uses tutor-approved session overrides in calendar downloads", () => {
    const events = getProject202CalendarEvents(undefined, {
      "2": {
        sessionNumber: 2,
        date: "2026-08-24",
        reason: "Travel",
        updatedAt: "2026-08-13T00:00:00.000Z",
      },
    });
    expect(events.find((event) => event.uid.includes("session-02"))).toMatchObject({
      startDate: "2026-08-24",
      endDate: "2026-08-25",
    });
  });

  it("delays object URL cleanup until the browser can consume the download", () => {
    vi.useFakeTimers();
    const click = vi.fn();
    const remove = vi.fn();
    const appendChild = vi.fn();
    const createObjectURL = vi.fn(() => "blob:project-202-calendar");
    const revokeObjectURL = vi.fn();
    const link = { href: "", download: "", hidden: false, click, remove };

    vi.stubGlobal("document", {
      createElement: vi.fn(() => link),
      body: { appendChild },
    });
    vi.stubGlobal("URL", { createObjectURL, revokeObjectURL });

    downloadProject202Calendar({ generatedAt: FIXED_GENERATED_AT });

    expect(createObjectURL).toHaveBeenCalledOnce();
    expect(appendChild).toHaveBeenCalledWith(link);
    expect(click).toHaveBeenCalledOnce();
    expect(remove).toHaveBeenCalledOnce();
    expect(revokeObjectURL).not.toHaveBeenCalled();

    vi.advanceTimersByTime(999);
    expect(revokeObjectURL).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(revokeObjectURL).toHaveBeenCalledWith(
      "blob:project-202-calendar",
    );
  });
});
