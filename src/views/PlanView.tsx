import { CalendarDays, GraduationCap, ListChecks } from "lucide-react";
import type { ReactNode } from "react";
import { parseWeekSegment, weekSegment } from "../lib/hashRoute";
import { TOTAL_WEEKS } from "../lib/dates";
import { SectionPanel, SectionTabs } from "./shared";

/**
 * Plan › This week / Full plan / Session notes. `#plan/<segment>`:
 * "" or `week-N` → This week (week N); `roadmap` or `roadmap-week-N` →
 * Full plan (opened at week N); `sessions` → Session notes.
 */
export type PlanSection = "week" | "roadmap" | "sessions";

export interface PlanRoute {
  section: PlanSection;
  week: number | null;
}

const ROADMAP = "roadmap";
const ROADMAP_PREFIX = "roadmap-";

export function parsePlanSegment(segment: string): PlanRoute {
  if (segment === "sessions") return { section: "sessions", week: null };
  if (segment === ROADMAP) return { section: "roadmap", week: null };
  if (segment.startsWith(ROADMAP_PREFIX)) {
    return { section: "roadmap", week: parseWeekSegment(segment.slice(ROADMAP_PREFIX.length), TOTAL_WEEKS) };
  }
  return { section: "week", week: parseWeekSegment(segment, TOTAL_WEEKS) };
}

export function planSegment(section: PlanSection, week: number | null = null): string {
  if (section === "sessions") return "sessions";
  if (section === "roadmap") return week ? `${ROADMAP_PREFIX}${weekSegment(week)}` : ROADMAP;
  return week ? weekSegment(week) : "";
}

export function PlanView({
  section,
  onSection,
  week,
  roadmap,
  sessions,
}: {
  section: PlanSection;
  onSection: (section: PlanSection) => void;
  week: ReactNode;
  roadmap: ReactNode;
  sessions: ReactNode;
}) {
  return (
    <div className="view-stack plan-view">
      <SectionTabs
        label="Plan sections"
        idPrefix="plan"
        active={section}
        onSelect={onSection}
        items={[
          { id: "week", label: "This week", icon: ListChecks },
          { id: "roadmap", label: "Full plan", icon: CalendarDays },
          { id: "sessions", label: "Session notes", icon: GraduationCap },
        ]}
      />
      <SectionPanel idPrefix="plan" active={section}>
        {section === "week" && week}
        {section === "roadmap" && roadmap}
        {section === "sessions" && sessions}
      </SectionPanel>
    </div>
  );
}
