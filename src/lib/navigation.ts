// Moved out of App.tsx unchanged (P3.9 split); see git history for origin.
import { Archive, Banknote, CalendarDays, Gauge, GraduationCap, LayoutDashboard, ListChecks, NotebookPen, PlayCircle, TimerReset, TrendingUp, UserCog } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { TOTAL_WEEKS } from "../lib/dates";

export type TabId =
  | "dashboard"
  | "roadmap"
  | "weekly"
  | "sessions"
  | "practice"
  | "mastery"
  | "mocks"
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
}


export const NAV_ITEMS: NavItem[] = [
  {
    id: "dashboard",
    label: "Home",
    mobileLabel: "Home",
    icon: LayoutDashboard,
  },
  { id: "roadmap", label: "Study Plan", mobileLabel: "Plan", icon: CalendarDays },
  { id: "weekly", label: "This Week", mobileLabel: "Week", icon: ListChecks },
  { id: "sessions", label: "Session Notes", mobileLabel: "Sessions", icon: GraduationCap, hint: "Lesson outcomes & homework" },
  { id: "practice", label: "Practice", mobileLabel: "Practice", icon: TimerReset },
  { id: "mastery", label: "Topic Progress", mobileLabel: "Topics", icon: Gauge, hint: "Mastery by subject" },
  { id: "mocks", label: "Mock Results", mobileLabel: "Mocks", icon: TrendingUp },
  { id: "errors", label: "Mistake Review", mobileLabel: "Mistakes", icon: Archive, hint: "Corrections & retests" },
  { id: "notes", label: "Notes & Data", mobileLabel: "Notes", icon: NotebookPen, hint: "General notes & backups" },
  { id: "live", label: "Session Mode", mobileLabel: "Teach", icon: PlayCircle },
  { id: "coach", label: "Tutor Admin", mobileLabel: "Admin", icon: UserCog },
  { id: "payments", label: "Payments", mobileLabel: "Payments", icon: Banknote },
];


export const TAB_IDS: readonly TabId[] = NAV_ITEMS.map((item) => item.id);


export const NAV_GROUPS: Array<{ label: string; ids: TabId[] }> = [
  { label: "Focus", ids: ["dashboard", "weekly"] },
  { label: "Plan", ids: ["roadmap", "sessions"] },
  { label: "Evidence", ids: ["practice", "mastery", "mocks", "errors"] },
  { label: "Records", ids: ["notes"] },
  { label: "Tutor", ids: ["live", "coach", "payments"] },
];


export const MOBILE_PRIMARY_IDS: TabId[] = [
  "dashboard",
  "weekly",
  "roadmap",
  "practice",
];


export const MOBILE_MORE_IDS: TabId[] = [
  "sessions",
  "mastery",
  "mocks",
  "errors",
  "notes",
  "live",
  "coach",
  "payments",
];


export const TAB_COPY: Record<TabId, { eyebrow: string; title: string; description: string }> = {
  dashboard: {
    eyebrow: "Your study workspace",
    title: "Home",
    description: "One clear next step, with the full plan available when you need it.",
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
  mastery: {
    eyebrow: "Honest topic evidence",
    title: "Topic Progress",
    description: "Review each subject's practice results and tutor-assessed mastery.",
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
