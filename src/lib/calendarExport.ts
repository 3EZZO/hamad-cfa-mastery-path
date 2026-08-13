import program from "../data/program.json";
import { getWeekSessions, PLAN } from "../data/plan";
import { resolveReadingIds } from "../data/readings";
import type { SessionOverride } from "../types";
import { addDays, isValidDateOnly, parseDateOnly } from "./dates";
import { effectiveSessionDate, sessionDayLabel } from "./schedule";

export const PROJECT_202_CALENDAR_FILENAME = "project-202-calendar.ics";
export const PROJECT_202_TRACKER_URL =
  "https://3ezzo.github.io/hamad-cfa-project-202/";
export const PROJECT_202_CALENDAR_TIME_ZONE = "Asia/Riyadh";
export const CALENDAR_PREFERENCES_STORAGE_KEY =
  "project-202-calendar-preferences-v1";

const DEFAULT_CALENDAR_NAME = "Project 202 - Hamad's CFA Level I Plan";
const DEFAULT_PRODUCT_ID =
  "-//Project 202//Hamad CFA Level I Mastery System//EN";
const UID_DOMAIN = "project-202-tracker";

export type SessionDay = "monday" | "wednesday" | "saturday" | "friday";

export interface CalendarExportPreferences {
  mondayTime: string;
  wednesdayTime: string;
  saturdayTime: string;
  fridayTime: string;
  sessionReminderMinutes: number;
  milestoneReminderDays: number;
}

export const DEFAULT_CALENDAR_EXPORT_PREFERENCES: CalendarExportPreferences = {
  mondayTime: "",
  wednesdayTime: "",
  saturdayTime: "",
  fridayTime: "",
  sessionReminderMinutes: 60,
  milestoneReminderDays: 7,
};

export type Project202CalendarEventKind =
  | "tutor-session"
  | "administrative-milestone";

interface CalendarEventBase {
  uid: string;
  kind: Project202CalendarEventKind;
  summary: string;
  description: string;
  categories: string[];
  transparent: boolean;
  alarmDescription: string;
}

export interface TimedProject202CalendarEvent extends CalendarEventBase {
  kind: "tutor-session";
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
  timeZone: typeof PROJECT_202_CALENDAR_TIME_ZONE;
  reminderMinutes: number;
}

export interface AllDayProject202CalendarEvent extends CalendarEventBase {
  kind: "administrative-milestone";
  startDate: string;
  endDate: string;
  reminderDays: number;
}

export type Project202CalendarEvent =
  | TimedProject202CalendarEvent
  | AllDayProject202CalendarEvent;

export interface Project202CalendarOptions {
  /** Supplies DTSTAMP. Pass a fixed value in tests or reproducible builds. */
  generatedAt?: Date;
  calendarName?: string;
  productId?: string;
  trackerUrl?: string;
  sessionOverrides?: Record<string, SessionOverride>;
  preferences?: CalendarExportPreferences;
}

export interface Project202CalendarDownloadOptions
  extends Project202CalendarOptions {
  fileName?: string;
}

interface AdministrativeMilestone {
  date: string;
  label: string;
  action: string;
}

function padSessionNumber(value: number): string {
  return String(value).padStart(2, "0");
}

function compactDate(value: string): string {
  if (!isValidDateOnly(value)) {
    throw new Error(`Invalid calendar date: ${value}`);
  }
  return value.replaceAll("-", "");
}

function compactLocalDateTime(date: string, time: string): string {
  return `${compactDate(date)}T${time.replace(":", "")}00`;
}

function formatUtcTimestamp(value: Date): string {
  if (Number.isNaN(value.getTime())) {
    throw new Error("Calendar generatedAt must be a valid Date.");
  }
  return value
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");
}

/** RFC 5545 TEXT escaping. */
function escapeText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\r\n|\r|\n/g, "\\n")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,");
}

function slug(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

function isTime(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{2}:\d{2}$/.test(value)) return false;
  const [hour, minute] = value.split(":").map(Number);
  return hour! >= 0 && hour! <= 23 && minute! >= 0 && minute! <= 59;
}

function normalizedInteger(
  value: unknown,
  minimum: number,
  maximum: number,
  fallback: number,
): number {
  const number = Number(value);
  return Number.isInteger(number)
    ? Math.max(minimum, Math.min(maximum, number))
    : fallback;
}

export function normalizeCalendarExportPreferences(
  value: unknown,
): CalendarExportPreferences {
  const raw =
    typeof value === "object" && value !== null && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  const defaults = DEFAULT_CALENDAR_EXPORT_PREFERENCES;
  return {
    mondayTime: isTime(raw.mondayTime) ? raw.mondayTime : defaults.mondayTime,
    wednesdayTime: isTime(raw.wednesdayTime)
      ? raw.wednesdayTime
      : defaults.wednesdayTime,
    saturdayTime: isTime(raw.saturdayTime)
      ? raw.saturdayTime
      : defaults.saturdayTime,
    fridayTime: isTime(raw.fridayTime) ? raw.fridayTime : defaults.fridayTime,
    sessionReminderMinutes: normalizedInteger(
      raw.sessionReminderMinutes,
      0,
      10_080,
      defaults.sessionReminderMinutes,
    ),
    milestoneReminderDays: normalizedInteger(
      raw.milestoneReminderDays,
      0,
      30,
      defaults.milestoneReminderDays,
    ),
  };
}

export function loadCalendarExportPreferences(): CalendarExportPreferences {
  if (typeof window === "undefined") {
    return { ...DEFAULT_CALENDAR_EXPORT_PREFERENCES };
  }
  try {
    const value = window.localStorage.getItem(CALENDAR_PREFERENCES_STORAGE_KEY);
    return value
      ? normalizeCalendarExportPreferences(JSON.parse(value))
      : { ...DEFAULT_CALENDAR_EXPORT_PREFERENCES };
  } catch {
    return { ...DEFAULT_CALENDAR_EXPORT_PREFERENCES };
  }
}

export function saveCalendarExportPreferences(
  preferences: CalendarExportPreferences,
): CalendarExportPreferences {
  const normalized = normalizeCalendarExportPreferences(preferences);
  if (typeof window !== "undefined") {
    window.localStorage.setItem(
      CALENDAR_PREFERENCES_STORAGE_KEY,
      JSON.stringify(normalized),
    );
  }
  return normalized;
}

function sessionDay(date: string): SessionDay {
  const day = parseDateOnly(date).getDay();
  if (day === 1) return "monday";
  if (day === 3) return "wednesday";
  if (day === 5) return "friday";
  if (day === 6) return "saturday";
  throw new Error(`Tutor session uses an unsupported calendar day: ${date}`);
}

function sessionStartTime(
  date: string,
  preferences: CalendarExportPreferences,
): string {
  const time = preferences[`${sessionDay(date)}Time`];
  if (!isTime(time)) {
    throw new Error(
      "Choose a Riyadh start time for every tutor-session weekday before exporting the calendar.",
    );
  }
  return time;
}

function addMinutesToLocalDateTime(
  date: string,
  time: string,
  minutes: number,
): { date: string; time: string } {
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  const value = new Date(Date.UTC(year!, month! - 1, day, hour!, minute!));
  value.setUTCMinutes(value.getUTCMinutes() + minutes);
  return {
    date: `${String(value.getUTCFullYear()).padStart(4, "0")}-${String(value.getUTCMonth() + 1).padStart(2, "0")}-${String(value.getUTCDate()).padStart(2, "0")}`,
    time: `${String(value.getUTCHours()).padStart(2, "0")}:${String(value.getUTCMinutes()).padStart(2, "0")}`,
  };
}

/**
 * Fold a content line at 75 UTF-8 octets as required by RFC 5545 section 3.1.
 * Continuation lines begin with one space, which counts toward their limit.
 */
function foldContentLine(line: string): string[] {
  const encoder = new TextEncoder();
  const folded: string[] = [];
  let chunk = "";
  let limit = 75;

  for (const character of line) {
    const next = `${chunk}${character}`;
    if (encoder.encode(next).length > limit && chunk) {
      folded.push(folded.length === 0 ? chunk : ` ${chunk}`);
      chunk = character;
      limit = 74;
    } else {
      chunk = next;
    }
  }

  if (chunk || folded.length === 0) {
    folded.push(folded.length === 0 ? chunk : ` ${chunk}`);
  }
  return folded;
}

function alarmLines(event: Project202CalendarEvent): string[] {
  const trigger =
    event.kind === "tutor-session"
      ? `-PT${event.reminderMinutes}M`
      : `-P${event.reminderDays}D`;
  return [
    "BEGIN:VALARM",
    "ACTION:DISPLAY",
    `TRIGGER:${trigger}`,
    `DESCRIPTION:${escapeText(event.alarmDescription)}`,
    "END:VALARM",
  ];
}

function eventLines(
  event: Project202CalendarEvent,
  timestamp: string,
  trackerUrl: string,
): string[] {
  const categoryList = event.categories.map(escapeText).join(",");
  const dateLines =
    event.kind === "tutor-session"
      ? [
          `DTSTART;TZID=${event.timeZone}:${compactLocalDateTime(event.startDate, event.startTime)}`,
          `DTEND;TZID=${event.timeZone}:${compactLocalDateTime(event.endDate, event.endTime)}`,
        ]
      : [
          `DTSTART;VALUE=DATE:${compactDate(event.startDate)}`,
          `DTEND;VALUE=DATE:${compactDate(event.endDate)}`,
        ];
  return [
    "BEGIN:VEVENT",
    `UID:${event.uid}`,
    `DTSTAMP:${timestamp}`,
    ...dateLines,
    `SUMMARY:${escapeText(event.summary)}`,
    `DESCRIPTION:${escapeText(event.description)}`,
    `CATEGORIES:${categoryList}`,
    `URL:${trackerUrl}`,
    "STATUS:CONFIRMED",
    `TRANSP:${event.transparent ? "TRANSPARENT" : "OPAQUE"}`,
    `X-PROJECT-202-EVENT-TYPE:${event.kind.toUpperCase()}`,
    ...alarmLines(event),
    "END:VEVENT",
  ];
}

const RIYADH_TIMEZONE_LINES = [
  "BEGIN:VTIMEZONE",
  `TZID:${PROJECT_202_CALENDAR_TIME_ZONE}`,
  "X-LIC-LOCATION:Asia/Riyadh",
  "BEGIN:STANDARD",
  "TZOFFSETFROM:+0300",
  "TZOFFSETTO:+0300",
  "TZNAME:+03",
  "DTSTART:19700101T000000",
  "END:STANDARD",
  "END:VTIMEZONE",
];

export function getProject202CalendarEvents(
  trackerUrl = PROJECT_202_TRACKER_URL,
  sessionOverrides: Record<string, SessionOverride> = {},
  preferences: CalendarExportPreferences = DEFAULT_CALENDAR_EXPORT_PREFERENCES,
): Project202CalendarEvent[] {
  const safePreferences = normalizeCalendarExportPreferences(preferences);
  const sessionEvents = PLAN.flatMap((week) =>
    getWeekSessions(week).map((session): TimedProject202CalendarEvent => {
      const sessionNumber = padSessionNumber(session.number);
      const effectiveDate = effectiveSessionDate(session, sessionOverrides);
      const override = sessionOverrides[String(session.number)];
      const startTime = sessionStartTime(effectiveDate, safePreferences);
      const end = addMinutesToLocalDateTime(
        effectiveDate,
        startTime,
        session.durationMinutes,
      );
      const moduleTitles = resolveReadingIds(session.readings).map(
        (reading) => reading.title,
      );
      const description = [
        `Session ${sessionNumber} of ${program.tutoringRhythm.totalSessions}`,
        `Week ${String(week.week).padStart(2, "0")} - ${week.phase}`,
        `Rhythm: ${sessionDayLabel(effectiveDate)}`,
        `Duration: ${session.durationMinutes} minutes`,
        `Objective: ${session.objective}`,
        `Weekly focus: ${week.focus}`,
        `Topics: ${week.topics.join(", ")}`,
        ...(moduleTitles.length
          ? [`Official 2027 modules: ${moduleTitles.join("; ")}`]
          : []),
        ...(override && override.date !== session.date
          ? [`Rescheduled from ${session.date}: ${override.reason}`]
          : []),
        `Tracker: ${trackerUrl}`,
      ].join("\n");

      return {
        uid: `project-202-session-${sessionNumber}@${UID_DOMAIN}`,
        kind: "tutor-session",
        startDate: effectiveDate,
        startTime,
        endDate: end.date,
        endTime: end.time,
        timeZone: PROJECT_202_CALENDAR_TIME_ZONE,
        reminderMinutes: safePreferences.sessionReminderMinutes,
        summary: `Project 202 - Session ${sessionNumber}: ${session.title}`,
        description,
        alarmDescription: `Project 202 Session ${sessionNumber} starts soon. Open the tracker and prepare the assigned evidence.`,
        categories: ["Project 202", "CFA Level I", "Tutoring"],
        transparent: false,
      };
    }),
  );

  const administrativeMilestones =
    program.administrativeMilestones as AdministrativeMilestone[];
  const milestoneEvents = administrativeMilestones.map(
    (milestone): AllDayProject202CalendarEvent => ({
      uid: `project-202-milestone-${compactDate(milestone.date)}-${slug(milestone.label)}@${UID_DOMAIN}`,
      kind: "administrative-milestone",
      startDate: milestone.date,
      endDate: addDays(milestone.date, 1),
      reminderDays: safePreferences.milestoneReminderDays,
      summary: `Project 202 - ${milestone.label}`,
      description: [
        milestone.action,
        `Administrative milestone for ${program.brand}.`,
        `Tracker: ${trackerUrl}`,
      ].join("\n"),
      alarmDescription: `Project 202 reminder: ${milestone.label}. ${milestone.action}`,
      categories: ["Project 202", "CFA Level I", "Administrative milestone"],
      transparent: true,
    }),
  );

  return [...sessionEvents, ...milestoneEvents].sort(
    (left, right) =>
      left.startDate.localeCompare(right.startDate) ||
      (left.kind === right.kind
        ? left.summary.localeCompare(right.summary)
        : left.kind === "tutor-session"
          ? -1
          : 1),
  );
}

/** Build a complete RFC 5545 iCalendar import file with CRLF lines. */
export function createProject202Calendar(
  options: Project202CalendarOptions = {},
): string {
  const timestamp = formatUtcTimestamp(options.generatedAt ?? new Date());
  const trackerUrl = options.trackerUrl ?? PROJECT_202_TRACKER_URL;
  const preferences = normalizeCalendarExportPreferences(
    options.preferences ?? DEFAULT_CALENDAR_EXPORT_PREFERENCES,
  );
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    `PRODID:${options.productId ?? DEFAULT_PRODUCT_ID}`,
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeText(options.calendarName ?? DEFAULT_CALENDAR_NAME)}`,
    `X-WR-CALDESC:${escapeText("Timed Project 202 tutoring sessions and all-day administrative milestones for calendar import.")}`,
    ...RIYADH_TIMEZONE_LINES,
    ...getProject202CalendarEvents(
      trackerUrl,
      options.sessionOverrides,
      preferences,
    ).flatMap((event) => eventLines(event, timestamp, trackerUrl)),
    "END:VCALENDAR",
  ];

  return `${lines.flatMap(foldContentLine).join("\r\n")}\r\n`;
}

/** Generate and download a calendar import file in a browser. */
export function downloadProject202Calendar(
  options: Project202CalendarDownloadOptions = {},
): void {
  if (typeof document === "undefined") {
    throw new Error("Calendar download is only available in a browser.");
  }

  const { fileName = PROJECT_202_CALENDAR_FILENAME, ...calendarOptions } =
    options;
  const calendar = createProject202Calendar(calendarOptions);
  const blob = new Blob([calendar], { type: "text/calendar;charset=utf-8" });
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = fileName;
  link.hidden = true;
  document.body.appendChild(link);
  link.click();
  link.remove();
  globalThis.setTimeout(() => URL.revokeObjectURL(objectUrl), 1_000);
}
