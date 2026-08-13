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
  saveCalendarExportPreferences,
} from "./calendarExport";
import { cascadeReschedule } from "./schedule";

const FIXED_GENERATED_AT = new Date("2026-08-13T05:30:45.000Z");
const PREFERENCES = {
  mondayTime: "19:15",
  wednesdayTime: "18:30",
  saturdayTime: "10:45",
  fridayTime: "16:00",
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

describe("Project 202 calendar export", () => {
  it("exports every tutor session as timed and every milestone as all-day", () => {
    const events = getProject202CalendarEvents(undefined, {}, PREFERENCES);
    const sessions = events.filter((event) => event.kind === "tutor-session");
    const milestones = events.filter(
      (event) => event.kind === "administrative-milestone",
    );

    expect(sessions).toHaveLength(program.tutoringRhythm.totalSessions);
    expect(milestones).toHaveLength(program.administrativeMilestones.length);
    expect(sessions[0]).toMatchObject({
      uid: "project-202-session-01@project-202-tracker",
      startDate: program.firstTutorSession,
      startTime: "18:30",
      endTime: "20:00",
      timeZone: "Asia/Riyadh",
      reminderMinutes: 90,
    });
    expect(sessions.at(-1)).toMatchObject({
      uid: "project-202-session-68@project-202-tracker",
      startDate: "2027-02-26",
      startTime: "16:00",
    });
    expect(milestones[0]).toMatchObject({
      reminderDays: 5,
      transparent: true,
    });
    expect(new Set(events.map((event) => event.uid)).size).toBe(events.length);
  });

  it("builds timed Riyadh events and all-day deadlines with display alarms", () => {
    const calendar = createProject202Calendar({
      generatedAt: FIXED_GENERATED_AT,
      preferences: PREFERENCES,
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
    expect(unfolded.match(/BEGIN:VALARM/g)).toHaveLength(expectedEvents);
    expect(unfolded).toContain("BEGIN:VTIMEZONE");
    expect(unfolded).toContain("TZID:Asia/Riyadh");
    expect(unfolded).toContain(
      `DTSTART;TZID=Asia/Riyadh:${program.firstTutorSession.replaceAll("-", "")}T183000`,
    );
    expect(unfolded).toContain(
      `DTEND;TZID=Asia/Riyadh:${program.firstTutorSession.replaceAll("-", "")}T200000`,
    );
    expect(unfolded).toContain("TRIGGER:-PT90M");
    expect(unfolded).toContain("DTSTART;VALUE=DATE:20261105");
    expect(unfolded).toContain("DTEND;VALUE=DATE:20261106");
    expect(unfolded).toContain("TRIGGER:-P5D");
    expect(unfolded).toContain("METHOD:PUBLISH");
    expect(unfolded).not.toContain("ORGANIZER");
    expect(unfolded).not.toContain("ATTENDEE");
  });

  it("uses the selected default for every supported tutor-session weekday", () => {
    const sessions = getProject202CalendarEvents(undefined, {}, PREFERENCES)
      .filter((event) => event.kind === "tutor-session");
    expect(sessions.find((event) => event.startDate === "2026-08-24")?.startTime)
      .toBe("19:15");
    expect(sessions.find((event) => event.startDate === "2026-08-26")?.startTime)
      .toBe("18:30");
    expect(sessions.find((event) => event.startDate === "2026-08-22")?.startTime)
      .toBe("10:45");
    expect(sessions.find((event) => event.startDate === "2027-02-26")?.startTime)
      .toBe("16:00");
  });

  it("uses effective rescheduled dates and that date's selected weekday time", () => {
    const overrides = cascadeReschedule(
      {},
      2,
      "2026-08-24",
      "Travel",
      "2026-08-13T00:00:00.000Z",
    ).overrides;
    const events = getProject202CalendarEvents(undefined, overrides, PREFERENCES);
    expect(events.find((event) => event.uid.includes("session-02"))).toMatchObject({
      startDate: "2026-08-24",
      startTime: "19:15",
      endDate: "2026-08-24",
      endTime: "20:45",
    });
  });

  it("keeps stable session UIDs when dates and time preferences change", () => {
    const canonical = getProject202CalendarEvents(undefined, {}, PREFERENCES)
      .find((event) => event.uid.includes("session-02"));
    const overrides = cascadeReschedule({}, 2, "2026-08-24", "Travel").overrides;
    const changed = getProject202CalendarEvents(
      undefined,
      overrides,
      { ...PREFERENCES, mondayTime: "08:00" },
    ).find((event) => event.uid.includes("session-02"));
    expect(changed?.uid).toBe(canonical?.uid);
  });

  it("uses only CRLF separators and folds every physical line to 75 octets", () => {
    const calendar = createProject202Calendar({
      generatedAt: FIXED_GENERATED_AT,
      preferences: PREFERENCES,
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
      createProject202Calendar({
        generatedAt: FIXED_GENERATED_AT,
        preferences: PREFERENCES,
      }),
    );

    expect(unfolded).toContain(
      "SUMMARY:Project 202 - Session 25: CAPM\\, market model\\, factor models\\, and Equity integration",
    );
    expect(unfolded).toMatch(
      /DESCRIPTION:Session 01 of 68\\nWeek 01 - .*\\nRhythm:/,
    );
  });

  it("normalizes and persists browser-only calendar preferences", () => {
    const normalized = normalizeCalendarExportPreferences({
      mondayTime: "25:00",
      wednesdayTime: "17:05",
      saturdayTime: null,
      fridayTime: "09:30",
      sessionReminderMinutes: 20_000,
      milestoneReminderDays: -2,
    });
    expect(normalized).toEqual({
      ...DEFAULT_CALENDAR_EXPORT_PREFERENCES,
      wednesdayTime: "17:05",
      fridayTime: "09:30",
      sessionReminderMinutes: 10_080,
      milestoneReminderDays: 0,
    });

    saveCalendarExportPreferences(PREFERENCES);
    expect(window.localStorage.setItem).toHaveBeenCalledWith(
      CALENDAR_PREFERENCES_STORAGE_KEY,
      JSON.stringify(PREFERENCES),
    );
    expect(loadCalendarExportPreferences()).toEqual(PREFERENCES);
  });

  it("does not invent hidden session times before the user chooses them", () => {
    expect(DEFAULT_CALENDAR_EXPORT_PREFERENCES).toMatchObject({
      mondayTime: "",
      wednesdayTime: "",
      saturdayTime: "",
      fridayTime: "",
    });
    expect(() =>
      createProject202Calendar({ generatedAt: FIXED_GENERATED_AT }),
    ).toThrow(/choose a Riyadh start time/i);
  });

  it("delays object URL cleanup until the browser consumes the import file", () => {
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

    expect(createObjectURL).toHaveBeenCalledOnce();
    expect(appendChild).toHaveBeenCalledWith(link);
    expect(click).toHaveBeenCalledOnce();
    expect(remove).toHaveBeenCalledOnce();
    expect(revokeObjectURL).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1_000);
    expect(revokeObjectURL).toHaveBeenCalledWith(
      "blob:project-202-calendar",
    );
  });
});
