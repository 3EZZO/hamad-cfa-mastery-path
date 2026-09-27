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


/** Every tab the shell can render (either layout). */
export const TAB_IDS: readonly TabId[] = NAV_ITEMS.map((item) => item.id);


export function navItem(id: TabId): NavItem {
  return NAV_ITEMS.find((item) => item.id === id)!;
}


/**
 * Two navigation layouts over one set of views. "destinations" leads with
 * Module Tests, then Today · Plan · Practice · Progress, plus Notes and the
 * tutor group, and opens on Tests; "classic" restores the earlier tab list
 * (opening on Home) for a few weeks as a
 * device-only fallback (see navLayout.ts). The retired tabs are allowed only
 * in classic, so in the new layout their links resolve through the aliases
 * in hashRoute.ts.
 */
export type NavLayout = "destinations" | "classic";

export interface NavGroup {
  label: string;
  ids: TabId[];
}

export interface NavConfig {
  layout: NavLayout;
  /** Where the app opens when the link names no tab (a fresh launch). */
  home: TabId;
  /** Tabs the hash may select in this layout. */
  tabs: readonly TabId[];
  groups: NavGroup[];
  mobilePrimary: TabId[];
  mobileMore: TabId[];
  /** Alt+1…9 order; explicit so moving a sidebar entry never re-points a learned shortcut. */
  shortcutOrder: readonly TabId[];
}

export const TUTOR_TAB_IDS: readonly TabId[] = ["live", "coach", "payments"];

const DESTINATIONS: NavConfig = {
  layout: "destinations",
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

const CLASSIC: NavConfig = {
  layout: "classic",
  home: "dashboard",
  tabs: TAB_IDS,
  groups: [
    { label: "Focus", ids: ["dashboard", "weekly"] },
    { label: "Plan", ids: ["roadmap", "sessions"] },
    { label: "Evidence", ids: ["practice", "moduleMocks", "mastery", "mocks", "errors"] },
    { label: "Records", ids: ["notes"] },
    { label: "Tutor", ids: ["live", "coach", "payments"] },
  ],
  mobilePrimary: ["dashboard", "weekly", "roadmap", "practice"],
  mobileMore: ["moduleMocks", "sessions", "mastery", "mocks", "errors", "notes", "live", "coach", "payments"],
  shortcutOrder: ["dashboard", "roadmap", "weekly", "sessions", "practice", "mastery", "moduleMocks", "mocks", "errors", "notes", "live", "coach", "payments"],
};

export function navConfig(layout: NavLayout): NavConfig {
  return layout === "classic" ? CLASSIC : DESTINATIONS;
}

/** The items a layout shows, in sidebar order, for an account that may or may not teach. */
export function visibleNavItems(config: NavConfig, canTeach: boolean): NavItem[] {
  return config.groups
    .flatMap((group) => group.ids)
    .filter((id) => canTeach || !TUTOR_TAB_IDS.includes(id))
    .map(navItem);
}

/**
 * Where a request for `tab` (optionally at a week) opens in this layout: the
 * tab itself when the layout offers it, otherwise the destination and
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
    title: "Today",
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
    title: "Progress",
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
