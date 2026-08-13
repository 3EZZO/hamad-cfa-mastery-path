import program from "../data/program.json";
import { getWeekSessions, PLAN } from "../data/plan";
import { resolveReadingIds } from "../data/readings";
import { addDays } from "./dates";
import type { SessionOverride } from "../types";
import { effectiveSessionDate, sessionDayLabel } from "./schedule";

export const PROJECT_202_CALENDAR_FILENAME = "project-202-calendar.ics";
export const PROJECT_202_TRACKER_URL =
  "https://3ezzo.github.io/hamad-cfa-project-202/";

const DEFAULT_CALENDAR_NAME = "Project 202 - Hamad's CFA Level I Plan";
const DEFAULT_PRODUCT_ID =
  "-//Project 202//Hamad CFA Level I Mastery System//EN";
const UID_DOMAIN = "project-202-tracker";

export type Project202CalendarEventKind =
  | "tutor-session"
  | "administrative-milestone";

export interface Project202CalendarEvent {
  uid: string;
  kind: Project202CalendarEventKind;
  startDate: string;
  endDate: string;
  summary: string;
  description: string;
  categories: string[];
  transparent: boolean;
}

export interface Project202CalendarOptions {
  /** Supplies DTSTAMP. Pass a fixed value in tests or reproducible builds. */
  generatedAt?: Date;
  calendarName?: string;
  productId?: string;
  trackerUrl?: string;
  sessionOverrides?: Record<string, SessionOverride>;
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
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`Invalid calendar date: ${value}`);
  }
  return value.replaceAll("-", "");
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

function eventLines(
  event: Project202CalendarEvent,
  timestamp: string,
  trackerUrl: string,
): string[] {
  const categoryList = event.categories.map(escapeText).join(",");
  return [
    "BEGIN:VEVENT",
    `UID:${event.uid}`,
    `DTSTAMP:${timestamp}`,
    `DTSTART;VALUE=DATE:${compactDate(event.startDate)}`,
    `DTEND;VALUE=DATE:${compactDate(event.endDate)}`,
    `SUMMARY:${escapeText(event.summary)}`,
    `DESCRIPTION:${escapeText(event.description)}`,
    `CATEGORIES:${categoryList}`,
    `URL:${trackerUrl}`,
    "STATUS:CONFIRMED",
    `TRANSP:${event.transparent ? "TRANSPARENT" : "OPAQUE"}`,
    `X-PROJECT-202-EVENT-TYPE:${event.kind.toUpperCase()}`,
    "END:VEVENT",
  ];
}

/**
 * Returns the canonical all-day calendar events. Tutor meeting times are left
 * unset intentionally because the plan fixes the date and duration, but not a
 * start time. Users can add a time after importing without being misled by an
 * invented appointment time.
 */
export function getProject202CalendarEvents(
  trackerUrl = PROJECT_202_TRACKER_URL,
  sessionOverrides: Record<string, SessionOverride> = {},
): Project202CalendarEvent[] {
  const sessionEvents = PLAN.flatMap((week) =>
    getWeekSessions(week).map((session): Project202CalendarEvent => {
      const sessionNumber = padSessionNumber(session.number);
      const effectiveDate = effectiveSessionDate(session, sessionOverrides);
      const override = sessionOverrides[String(session.number)];
      const moduleTitles = resolveReadingIds(session.readings).map(
        (reading) => reading.title,
      );
      const description = [
        `Session ${sessionNumber} of ${program.tutoringRhythm.totalSessions}`,
        `Week ${String(week.week).padStart(2, "0")} - ${week.phase}`,
        `Rhythm: ${sessionDayLabel(effectiveDate)}`,
        `Planned duration: ${session.durationMinutes} minutes`,
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
        endDate: addDays(effectiveDate, 1),
        summary: `Project 202 - Session ${sessionNumber}: ${session.title}`,
        description,
        categories: ["Project 202", "CFA Level I", "Tutoring"],
        transparent: false,
      };
    }),
  );

  const administrativeMilestones =
    program.administrativeMilestones as AdministrativeMilestone[];
  const milestoneEvents = administrativeMilestones.map(
    (milestone): Project202CalendarEvent => ({
      uid: `project-202-milestone-${compactDate(milestone.date)}-${slug(milestone.label)}@${UID_DOMAIN}`,
      kind: "administrative-milestone",
      startDate: milestone.date,
      endDate: addDays(milestone.date, 1),
      summary: `Project 202 - ${milestone.label}`,
      description: [
        milestone.action,
        `Administrative milestone for ${program.brand}.`,
        `Tracker: ${trackerUrl}`,
      ].join("\n"),
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

/** Build a complete RFC 5545 iCalendar document with CRLF line endings. */
export function createProject202Calendar(
  options: Project202CalendarOptions = {},
): string {
  const timestamp = formatUtcTimestamp(options.generatedAt ?? new Date());
  const trackerUrl = options.trackerUrl ?? PROJECT_202_TRACKER_URL;
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    `PRODID:${options.productId ?? DEFAULT_PRODUCT_ID}`,
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeText(options.calendarName ?? DEFAULT_CALENDAR_NAME)}`,
    `X-WR-CALDESC:${escapeText("All Project 202 tutoring sessions and key administrative milestones.")}`,
    ...getProject202CalendarEvents(trackerUrl, options.sessionOverrides).flatMap((event) =>
      eventLines(event, timestamp, trackerUrl),
    ),
    "END:VCALENDAR",
  ];

  return `${lines.flatMap(foldContentLine).join("\r\n")}\r\n`;
}

/** Generate and download the calendar in a browser. */
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
  // Safari and some Chromium builds may not have consumed the object URL when
  // click() returns. Keep it alive briefly, then release it to avoid a leak.
  globalThis.setTimeout(() => URL.revokeObjectURL(objectUrl), 1_000);
}
