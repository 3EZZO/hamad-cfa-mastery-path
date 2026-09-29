// Moved out of App.tsx unchanged (P3.9 split); see git history for origin.
import { Archive, Banknote, CalendarDays, CalendarRange, ClipboardCheck, Gauge, GraduationCap, Grid3x3, LayoutDashboard, ListChecks, NotebookPen, PlayCircle, TimerReset, TrendingUp, UserCog } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { TOTAL_WEEKS } from "../lib/dates";
import { resolveLegacyRoute, weekSegment } from "./hashRoute";

export type TabId =
  | "dashboard"
  | "roadmap"
  | "plan"
  | "weekly"
  | "sessions"
  | "practice"
  | "mastery"
  | "progress"
  | "mocks"
  | "moduleMocks"
  | "errors"
  | "notes"
  | "live"
  | "coach"
  | "payments";


export interface NavItem {
  id: TabId;
  label: string;
  mobileLabel: string;
  icon: LucideIcon;
  hint?: string;
  /** Extra palette search words, e.g. the names of screens this destination now hosts. */
  keywords?: string[];
}


export const NAV_ITEMS: NavItem[] = [
  {
    id: "dashboard",
    label: "Today",
    mobileLabel: "Today",
    icon: LayoutDashboard,
    keywords: ["Home"],
  },
  { id: "plan", label: "Plan", mobileLabel: "Plan", icon: CalendarRange, hint: "This week, the full plan and session notes", keywords: ["Study Plan", "This Week", "Week", "Session Notes", "Roadmap"] },
  { id: "roadmap", label: "Study Plan", mobileLabel: "Plan", icon: CalendarDays },
  { id: "weekly", label: "This Week", mobileLabel: "Week", icon: ListChecks },
  { id: "sessions", label: "Session Notes", mobileLabel: "Sessions", icon: GraduationCap, hint: "Lesson outcomes & homework" },
  { id: "practice", label: "Practice", mobileLabel: "Practice", icon: TimerReset, keywords: ["Mistake Review", "Mistakes", "Retests"] },
  { id: "progress", label: "Progress", mobileLabel: "Progress", icon: Grid3x3, hint: "Module heatmap and mocks", keywords: ["Topic Progress", "Topics", "Mock Results", "Mocks", "Heatmap"] },
  { id: "mastery", label: "Topic Progress", mobileLabel: "Topics", icon: Gauge, hint: "Mastery by subject" },
  { id: "moduleMocks", label: "Module Tests", mobileLabel: "Tests", icon: ClipboardCheck, hint: "Compulsory timed assessments", keywords: ["Tests", "Module mock", "Assessment", "Results", "Scores"] },
  { id: "mocks", label: "Mock Results", mobileLabel: "Mocks", icon: TrendingUp },
  { id: "errors", label: "Mistake Review", mobileLabel: "Mistakes", icon: Archive, hint: "Corrections & retests" },
  { id: "notes", label: "Notes & Data", mobileLabel: "Notes", icon: NotebookPen, hint: "General notes & backups" },
  { id: "live", label: "Session Mode", mobileLabel: "Teach", icon: PlayCircle },
  { id: "coach", label: "Tutor Admin", mobileLabel: "Admin", icon: UserCog },
  { id: "payments", label: "Payments", mobileLabel: "Payments", icon: Banknote },
];


/** Every tab id the app knows, including the retired ones that now resolve to a destination section. */
export const TAB_IDS: readonly TabId[] = NAV_ITEMS.map((item) => item.id);


export function navItem(id: TabId): NavItem {
  return NAV_ITEMS.find((item) => item.id === id)!;
}


/**
 * The navigation: Module Tests first, then Today · Plan · Practice ·
 * Progress, plus Notes and the tutor group; the app opens on Tests. The
 * retired tab ids (weekly, roadmap, sessions, mastery, mocks, errors) are no
 * longer offered: their links and in-app requests resolve through the
 * aliases in hashRoute.ts to the section that now hosts each screen.
 */
export interface NavGroup {
  label: string;
  ids: TabId[];
}

export interface NavConfig {
  /** Where the app opens when the link names no tab (a fresh launch). */
  home: TabId;
  /** Tabs the hash may select. */
  tabs: readonly TabId[];
  groups: NavGroup[];
  mobilePrimary: TabId[];
  mobileMore: TabId[];
  /** Alt+1…9 order; explicit so moving a sidebar entry never re-points a learned shortcut. */
  shortcutOrder: readonly TabId[];
}

export const TUTOR_TAB_IDS: readonly TabId[] = ["live", "coach", "payments"];

export const NAV: NavConfig = {
  home: "moduleMocks",
  tabs: ["moduleMocks", "dashboard", "plan", "practice", "progress", "notes", "live", "coach", "payments"],
  groups: [
    { label: "Focus", ids: ["moduleMocks", "dashboard"] },
    { label: "Study", ids: ["plan", "practice", "progress"] },
    { label: "Records", ids: ["notes"] },
    { label: "Tutor", ids: ["live", "coach", "payments"] },
  ],
  mobilePrimary: ["moduleMocks", "dashboard", "plan", "practice"],
  mobileMore: ["progress", "notes", "live", "coach", "payments"],
  shortcutOrder: ["moduleMocks", "dashboard", "plan", "practice", "progress", "notes", "live", "coach", "payments"],
};

/** The items the navigation shows, in sidebar order, for an account that may or may not teach. */
export function visibleNavItems(config: NavConfig, canTeach: boolean): NavItem[] {
  return config.groups
    .flatMap((group) => group.ids)
    .filter((id) => canTeach || !TUTOR_TAB_IDS.includes(id))
    .map(navItem);
}

/**
 * Where a request for `tab` (optionally at a week) opens: the tab itself
 * when the navigation offers it, otherwise the destination and
 * section that now host that screen. Null when neither is available.
 */
export function navigationTarget(
  config: NavConfig,
  tab: TabId,
  week?: number,
): { tab: TabId; segment: string | null } | null {
  if (config.tabs.includes(tab)) return { tab, segment: null };
  const moved = resolveLegacyRoute({ tab, segment: tab === "weekly" && week ? weekSegment(week) : "" });
  if (!moved || !config.tabs.includes(moved.tab as TabId)) return null;
  return { tab: moved.tab as TabId, segment: moved.segment };
}

/** The tabs Alt+1…9 reach, in order, from those the account can see. */
export function shortcutTabs(config: NavConfig, visible: readonly TabId[]): TabId[] {
  return config.shortcutOrder.filter((id) => visible.includes(id)).slice(0, 9);
}


export const TAB_COPY: Record<TabId, { eyebrow: string; title: string; description: string }> = {
  dashboard: {
    eyebrow: "Your study workspace",
    title: "Daily Briefing",
    description: "One clear next step, with the full plan available when you need it.",
  },
  plan: {
    eyebrow: "Week by week to 27 February 2027",
    title: "Plan",
    description: "This week's work, the full plan and the record of each lesson.",
  },
  roadmap: {
    eyebrow: "August 2026 — February 2027",
    title: "Study Plan",
    description: `The complete ${TOTAL_WEEKS}-week path from rebuild through exam day.`,
  },
  weekly: {
    eyebrow: "Your current focus",
    title: "This Week",
    description: "Complete the work in order and keep the evidence up to date.",
  },
  sessions: {
    eyebrow: "Tutor accountability",
    title: "Session Notes",
    description: "Record each lesson's outcomes, homework and next steps.",
  },
  practice: {
    eyebrow: "Adaptive independent practice",
    title: "Practice",
    description: "Strengthen weak concepts with fresh questions, immediate feedback, and spaced review.",
  },
  progress: {
    eyebrow: "Evidence by module and mock",
    title: "Performance Report",
    description: "Every curriculum module by exam weight, with full mock results alongside.",
  },
  mastery: {
    eyebrow: "Honest topic evidence",
    title: "Topic Progress",
    description: "Review each subject's practice results and tutor-assessed mastery.",
  },
  moduleMocks: {
    eyebrow: "One attempt · 12 minutes · full screen",
    title: "Module Tests",
    description: "A compulsory eight-question mock for each module, taken under exam conditions.",
  },
  mocks: {
    eyebrow: "Performance under conditions",
    title: "Mock Results",
    description: "Trend the score, then investigate what produced it.",
  },
  errors: {
    eyebrow: "Mistakes become assets",
    title: "Mistake Review",
    description: "Turn every recurring mistake into a correction rule and retest.",
  },
  notes: {
    eyebrow: "Reflection and continuity",
    title: "Notes & Data",
    description: "Keep general notes and commitments; check sync or manage backups.",
  },
  live: {
    eyebrow: "Private teaching command desk",
    title: "Session Mode",
    description: "Teach from one complete, searchable tutor workspace with the clock and evidence beside you.",
  },
  coach: {
    eyebrow: "Tutor-only administration",
    title: "Tutor Admin",
    description: "Manage approvals, schedules, launch checks, and recovery controls away from the live lesson.",
  },
  payments: {
    eyebrow: "Tutor-only billing",
    title: "Payments",
    description: "Track engagement income, log transfer receipts, and issue PDFs.",
  },
};
