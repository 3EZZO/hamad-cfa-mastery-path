import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import program from "../data/program.json";
import {
  CALENDAR_PREFERENCES_STORAGE_KEY,
  createProject202Calendar,
  DEFAULT_CALENDAR_EXPORT_PREFERENCES,
  downloadProject202Calendar,
  getProject202CalendarEvents,
  loadCalendarExportPreferences,
  normalizeCalendarExportPreferences,
  PROJECT_202_CALENDAR_FILENAME,
  saveCalendarExportPreferences,
} from "./calendarExport";
import { cascadeReschedule } from "./schedule";

const FIXED_GENERATED_AT = new Date("2026-08-21T05:30:45.000Z");
const PREFERENCES = {
  saturdayTime: "09:00",
  sessionReminderMinutes: 90,
  milestoneReminderDays: 5,
};

function unfold(calendar: string): string {
  return calendar.replace(/\r\n[ \t]/g, "");
}

beforeEach(() => {
  const values = new Map<string, string>();
  vi.stubGlobal("window", {
    localStorage: {
      getItem: vi.fn((key: string) => values.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => values.set(key, value)),
    },
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("Hamad CFA Mastery calendar export", () => {
  it("exports all 25 checkpoints and every milestone", () => {
    const events = getProject202CalendarEvents(undefined, {}, PREFERENCES);
    const sessions = events.filter((event) => event.kind === "tutor-session");
    const milestones = events.filter(
      (event) => event.kind === "administrative-milestone",
    );

    expect(sessions).toHaveLength(program.tutoringRhythm.totalSessions);
    expect(milestones).toHaveLength(program.administrativeMilestones.length);
    expect(sessions[0]).toMatchObject({
      uid: "project-202-session-01@project-202-tracker",
      startDate: "2026-09-05",
      startTime: "09:00",
      endTime: "11:30",
      timeZone: "Asia/Riyadh",
      reminderMinutes: 90,
    });
    expect(sessions.at(-1)).toMatchObject({
      uid: "project-202-session-25@project-202-tracker",
      startDate: "2027-02-20",
      startTime: "09:00",
      endTime: "11:00",
    });
    expect(milestones[0]).toMatchObject({ reminderDays: 5, transparent: true });
    expect(new Set(events.map((event) => event.uid)).size).toBe(events.length);
  });

  it("builds timed Riyadh events and all-day deadlines with alarms", () => {
    const calendar = createProject202Calendar({
      generatedAt: FIXED_GENERATED_AT,
      preferences: PREFERENCES,
    });
    const unfolded = unfold(calendar);
    const expectedEvents =
      program.tutoringRhythm.totalSessions +
      program.administrativeMilestones.length;

    expect(calendar.startsWith("BEGIN:VCALENDAR\r\nVERSION:2.0\r\n")).toBe(true);
    expect(calendar.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(unfolded.match(/BEGIN:VEVENT/g)).toHaveLength(expectedEvents);
    expect(unfolded.match(/BEGIN:VALARM/g)).toHaveLength(expectedEvents);
    expect(unfolded).toContain("TZID:Asia/Riyadh");
    expect(unfolded).toContain("DTSTART;TZID=Asia/Riyadh:20260905T090000");
    expect(unfolded).toContain("DTEND;TZID=Asia/Riyadh:20260905T113000");
    expect(unfolded).toContain("TRIGGER:-PT90M");
    expect(unfolded).toContain("DTSTART;VALUE=DATE:20270116");
    expect(unfolded).not.toContain("ATTENDEE");
  });

  it("keeps 09:00 for a tutor-approved Friday exception", () => {
    const overrides = cascadeReschedule(
      {},
      2,
      "2026-09-11",
      "Travel",
      "2026-08-21T00:00:00.000Z",
    ).overrides;
    const event = getProject202CalendarEvents(undefined, overrides, PREFERENCES)
      .find((item) => item.uid.includes("session-02"));
    expect(event).toMatchObject({
      startDate: "2026-09-11",
      startTime: "09:00",
      endDate: "2026-09-11",
      endTime: "11:00",
    });
  });

  it("keeps stable UIDs when a checkpoint uses the Friday exception", () => {
    const canonical = getProject202CalendarEvents(undefined, {}, PREFERENCES)
      .find((event) => event.uid.includes("session-02"));
    const overrides = cascadeReschedule({}, 2, "2026-09-11", "Travel").overrides;
    const changed = getProject202CalendarEvents(undefined, overrides, PREFERENCES)
      .find((event) => event.uid.includes("session-02"));
    expect(changed?.uid).toBe(canonical?.uid);
  });

  it("uses only CRLF separators and folds physical lines to 75 octets", () => {
    const calendar = createProject202Calendar({
      generatedAt: FIXED_GENERATED_AT,
      preferences: PREFERENCES,
    });
    const encoder = new TextEncoder();
    expect(calendar.replace(/\r\n/g, "")).not.toMatch(/[\r\n]/);
    for (const line of calendar.split("\r\n").filter(Boolean)) {
      expect(encoder.encode(line).length).toBeLessThanOrEqual(75);
    }
  });

  it("describes the weekly checkpoint model", () => {
    const unfolded = unfold(
      createProject202Calendar({
        generatedAt: FIXED_GENERATED_AT,
        preferences: PREFERENCES,
      }),
    );
    expect(unfolded).toContain(
      "SUMMARY:Hamad CFA Mastery - Session 01: Quant Masterclass I: returns\\, benchmarking\\, and time value",
    );
    expect(unfolded).toMatch(
      /DESCRIPTION:Session 01 of 25\\nWeek 01 - .*\\nRhythm: Saturday checkpoint/,
    );
  });

  it("defaults the single checkpoint time to Saturday 09:00", () => {
    expect(DEFAULT_CALENDAR_EXPORT_PREFERENCES.saturdayTime).toBe("09:00");
    expect(normalizeCalendarExportPreferences({ saturdayTime: "25:00" }))
      .toEqual(DEFAULT_CALENDAR_EXPORT_PREFERENCES);
    expect(
      normalizeCalendarExportPreferences({
        ...PREFERENCES,
        saturdayTime: "10:30",
      }).saturdayTime,
    ).toBe("09:00");

    saveCalendarExportPreferences(PREFERENCES);
    expect(window.localStorage.setItem).toHaveBeenCalledWith(
      CALENDAR_PREFERENCES_STORAGE_KEY,
      JSON.stringify(PREFERENCES),
    );
    expect(loadCalendarExportPreferences()).toEqual(PREFERENCES);
    expect(() =>
      createProject202Calendar({ generatedAt: FIXED_GENERATED_AT }),
    ).not.toThrow();
  });

  it("delays object URL cleanup until the browser consumes the file", () => {
    vi.useFakeTimers();
    const click = vi.fn();
    const remove = vi.fn();
    const appendChild = vi.fn();
    const createObjectURL = vi.fn(() => "blob:project-202-calendar");
    const revokeObjectURL = vi.fn();
    const link = { href: "", download: "", hidden: false, click, remove };
    const localStorage = window.localStorage;

    vi.stubGlobal("document", {
      createElement: vi.fn(() => link),
      body: { appendChild },
    });
    vi.stubGlobal("window", { localStorage });
    vi.stubGlobal("URL", { createObjectURL, revokeObjectURL });

    downloadProject202Calendar({
      generatedAt: FIXED_GENERATED_AT,
      preferences: PREFERENCES,
    });
    expect(click).toHaveBeenCalledOnce();
    expect(link.download).toBe(PROJECT_202_CALENDAR_FILENAME);
    expect(revokeObjectURL).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1_000);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:project-202-calendar");
  });
});
