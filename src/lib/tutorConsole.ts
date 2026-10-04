import type { PaymentConfig, PaymentRecord } from "./cloudPayments";

/**
 * Tutor Admin as a control centre: its sections (`#coach/<section>`), the
 * payments summary and the quick-find index. Pure, so every rule is tested
 * without Firestore.
 */

export type TutorSection = "overview" | "tests" | "practice" | "sessions" | "records";

export const TUTOR_SECTIONS: ReadonlyArray<{ id: TutorSection; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "tests", label: "Tests" },
  { id: "practice", label: "Practice" },
  { id: "sessions", label: "Sessions" },
  { id: "records", label: "Records" },
];

export function parseTutorSection(segment: string): TutorSection {
  return TUTOR_SECTIONS.some((section) => section.id === segment) ? (segment as TutorSection) : "overview";
}

// ------------------------------------------------------------------ payments

export interface PaymentSummary {
  currency: string;
  monthlyAmount: number;
  /** Paid in the current calendar month. */
  paidThisMonth: number;
  /** Pending or overdue records, any month. */
  outstanding: number;
  outstandingCount: number;
  overdueCount: number;
  /** Local `YYYY-MM-DD` of the next billing day (today or later). */
  nextDue: string;
  state: "paid" | "due" | "overdue";
}

function isoDay(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Billing day clamped to the month's length (e.g. 31 → 30 April). */
function billingDate(year: number, month: number, day: number): Date {
  const last = new Date(year, month + 1, 0).getDate();
  return new Date(year, month, Math.min(day, last));
}

export function summarizePayments(config: PaymentConfig, records: readonly PaymentRecord[], today: Date): PaymentSummary {
  const month = isoDay(today).slice(0, 7);
  const paidThisMonth = records
    .filter((record) => record.status === "paid" && record.dateRecorded.startsWith(month))
    .reduce((sum, record) => sum + record.amount, 0);
  const open = records.filter((record) => record.status !== "paid");
  const thisMonthBilling = billingDate(today.getFullYear(), today.getMonth(), config.billingDayOfMonth);
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const next = thisMonthBilling >= startOfToday
    ? thisMonthBilling
    : billingDate(today.getFullYear(), today.getMonth() + 1, config.billingDayOfMonth);
  const overdueCount = open.filter((record) => record.status === "overdue").length;
  return {
    currency: config.currency,
    monthlyAmount: config.monthlyAmount,
    paidThisMonth,
    outstanding: open.reduce((sum, record) => sum + record.amount, 0),
    outstandingCount: open.length,
    overdueCount,
    nextDue: isoDay(next),
    state: overdueCount > 0 ? "overdue" : paidThisMonth >= config.monthlyAmount ? "paid" : "due",
  };
}

// --------------------------------------------------------------- quick find

export type ConsoleEntryKind = "test" | "bank" | "session" | "reminder" | "section";

export interface ConsoleEntry {
  id: string;
  kind: ConsoleEntryKind;
  label: string;
  detail: string;
  section: TutorSection;
  /** DOM id of the row to bring into view after switching section, when there is one. */
  anchor: string | null;
  keywords: string[];
}

/** DOM ids shared by the panels and quick find. */
export const consoleAnchor = {
  test: (moduleId: string) => `coach-test-${moduleId}`,
  bank: (storageId: string) => `coach-bank-${storageId}`,
  reminders: "coach-reminders",
  approvals: "coach-approvals",
  reschedule: "coach-reschedule",
} as const;

function normalize(text: string): string {
  return text.toLowerCase().normalize("NFKD").replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * Ranks entries by how well every word of the query matches the label,
 * detail or keywords: a label prefix beats a word start beats a substring.
 */
export function searchConsole(entries: readonly ConsoleEntry[], query: string, limit = 8): ConsoleEntry[] {
  const words = normalize(query).split(" ").filter(Boolean);
  if (!words.length) return [];
  const scored = entries.flatMap((entry) => {
    const label = normalize(entry.label);
    const haystack = normalize([entry.label, entry.detail, ...entry.keywords].join(" "));
    let score = 0;
    for (const word of words) {
      if (label.startsWith(word)) score += 3;
      else if (` ${haystack}`.includes(` ${word}`)) score += 2;
      else if (haystack.includes(word)) score += 1;
      else return [];
    }
    return [{ entry, score }];
  });
  return scored
    .sort((left, right) => right.score - left.score || left.entry.label.localeCompare(right.entry.label))
    .slice(0, limit)
    .map(({ entry }) => entry);
}

// ------------------------------------------------------------------ overview

export interface ConsoleGlance {
  tests: { published: number; drafts: number; toRelease: number; toGrade: number; done: number };
  practice: { banks: number; unlocked: number; questions: number };
  reminders: { active: number; unacknowledged: number };
  approvals: number;
}

export interface GlanceInput {
  metas: ReadonlyArray<{ moduleId: string; status: "draft" | "published" }> | null;
  attempts: ReadonlyArray<{ moduleId: string; status: string; score: number | null; reviewReleased: boolean }> | null;
  reminders: ReadonlyArray<{ status: string; acknowledgedAtMs: number | null }> | null;
  banks: ReadonlyArray<{ storageId: string; questions: readonly unknown[] }> | null;
  assignedBankIds: readonly string[] | null;
  approvals: number;
}

export function consoleGlance(input: GlanceInput): ConsoleGlance {
  const metas = input.metas ?? [];
  const attempts = input.attempts ?? [];
  const finished = attempts.filter((attempt) => attempt.status !== "active");
  const assigned = new Set(input.assignedBankIds ?? []);
  const banks = input.banks ?? [];
  const active = (input.reminders ?? []).filter((reminder) => reminder.status === "active");
  return {
    tests: {
      published: metas.filter((meta) => meta.status === "published").length,
      drafts: metas.filter((meta) => meta.status === "draft").length,
      toRelease: finished.filter((attempt) => attempt.score !== null && !attempt.reviewReleased).length,
      toGrade: finished.filter((attempt) => attempt.score === null).length,
      done: finished.length,
    },
    practice: {
      banks: banks.length,
      unlocked: banks.filter((bank) => assigned.has(bank.storageId)).length,
      questions: banks.reduce((sum, bank) => sum + bank.questions.length, 0),
    },
    reminders: { active: active.length, unacknowledged: active.filter((reminder) => reminder.acknowledgedAtMs === null).length },
    approvals: input.approvals,
  };
}

/** What waits on the tutor in each section, for the tab badges. */
export function sectionCounts(glance: ConsoleGlance): Partial<Record<TutorSection, number>> {
  return {
    tests: glance.tests.drafts + glance.tests.toRelease + glance.tests.toGrade,
    sessions: glance.approvals,
  };
}

export interface EntryInput {
  tests: ReadonlyArray<{ id: string; code: string; title: string; topic: string; status: "draft" | "published" | null }>;
  banks: ReadonlyArray<{ storageId: string; title: string; topic: string; questions: number; unlocked: boolean }>;
  sessions: ReadonlyArray<{ number: number; title: string; dateLabel: string }>;
  reminders: ReadonlyArray<{ id: string; codes: string[]; deadline: string | null }>;
}

export function buildConsoleEntries(input: EntryInput): ConsoleEntry[] {
  return [
    ...TUTOR_SECTIONS.map((section): ConsoleEntry => ({
      id: `section-${section.id}`, kind: "section", label: section.label, detail: "Tutor Admin section",
      section: section.id, anchor: null, keywords: [],
    })),
    ...input.tests.map((test): ConsoleEntry => ({
      id: `test-${test.id}`, kind: "test", label: `${test.code} ${test.title}`,
      detail: `${test.topic} · ${test.status === null ? "Not uploaded" : test.status === "published" ? "Published" : "Draft"}`,
      section: "tests", anchor: consoleAnchor.test(test.id), keywords: ["test", "mock", test.id],
    })),
    ...input.banks.map((bank): ConsoleEntry => ({
      id: `bank-${bank.storageId}`, kind: "bank", label: bank.title,
      detail: `${bank.topic} · ${bank.questions} questions · ${bank.unlocked ? "Unlocked" : "Locked"}`,
      section: "practice", anchor: consoleAnchor.bank(bank.storageId), keywords: ["practice", "bank"],
    })),
    ...input.sessions.map((session): ConsoleEntry => ({
      id: `session-${session.number}`, kind: "session",
      label: `Session ${String(session.number).padStart(2, "0")}`, detail: `${session.dateLabel} · ${session.title}`,
      section: "sessions", anchor: consoleAnchor.reschedule, keywords: ["session", `s${session.number}`, "reschedule"],
    })),
    ...input.reminders.map((reminder): ConsoleEntry => ({
      id: `reminder-${reminder.id}`, kind: "reminder", label: `Reminder: ${reminder.codes.join(", ") || "no modules"}`,
      detail: reminder.deadline ? `Due ${reminder.deadline}` : "No deadline",
      section: "tests", anchor: consoleAnchor.reminders, keywords: ["reminder", "deadline"],
    })),
  ];
}
