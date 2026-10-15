import { CalendarDays, FileText, GraduationCap, ListChecks } from "lucide-react";
import type { ReactNode } from "react";
import { parseWeekSegment, weekSegment } from "../lib/hashRoute";
import { TOTAL_WEEKS } from "../lib/dates";
import { isVersionId } from "../features/teachingMaterials/materialTypes";
import { SectionPanel, SectionTabs } from "./shared";

/**
 * Plan › This week / Full plan / Session notes. `#plan/<segment>`:
 * "" or `week-N` → This week (week N); `roadmap` or `roadmap-week-N` →
 * Full plan (opened at week N); `sessions` → Session notes; `materials` →
 * Session materials (students); `material-<versionId>` → that shared PDF.
 */
export type PlanSection = "week" | "roadmap" | "sessions" | "materials";

export interface PlanRoute {
  section: PlanSection;
  week: number | null;
  /** Requested shared material; access is resolved by the view, not here. */
  materialVersionId?: string | null;
  /** A `material-…` segment whose id is not a valid version id. */
  invalidMaterial?: boolean;
}

const MATERIALS = "materials";
const MATERIAL_PREFIX = "material-";

const ROADMAP = "roadmap";
const ROADMAP_PREFIX = "roadmap-";

export function parsePlanSegment(segment: string): PlanRoute {
  if (segment === "sessions") return { section: "sessions", week: null };
  if (segment === MATERIALS) return { section: "materials", week: null, materialVersionId: null };
  if (segment.startsWith(MATERIAL_PREFIX)) {
    const versionId = segment.slice(MATERIAL_PREFIX.length);
    return isVersionId(versionId)
      ? { section: "materials", week: null, materialVersionId: versionId }
      : { section: "materials", week: null, materialVersionId: null, invalidMaterial: true };
  }
  if (segment === ROADMAP) return { section: "roadmap", week: null };
  if (segment.startsWith(ROADMAP_PREFIX)) {
    return { section: "roadmap", week: parseWeekSegment(segment.slice(ROADMAP_PREFIX.length), TOTAL_WEEKS) };
  }
  return { section: "week", week: parseWeekSegment(segment, TOTAL_WEEKS) };
}

export function materialSegment(versionId: string | null): string {
  return versionId && isVersionId(versionId) ? `${MATERIAL_PREFIX}${versionId}` : MATERIALS;
}

export function planSegment(section: PlanSection, week: number | null = null): string {
  if (section === "sessions") return "sessions";
  if (section === "materials") return MATERIALS;
  if (section === "roadmap") return week ? `${ROADMAP_PREFIX}${weekSegment(week)}` : ROADMAP;
  return week ? weekSegment(week) : "";
}

export function PlanView({
  section,
  onSection,
  week,
  roadmap,
  sessions,
  materials,
}: {
  section: PlanSection;
  onSection: (section: PlanSection) => void;
  week: ReactNode;
  roadmap: ReactNode;
  sessions: ReactNode;
  /** Student only: PDFs the tutor explicitly shared. */
  materials?: ReactNode;
}) {
  const active = section === "materials" && !materials ? "week" : section;
  return (
    <div className="view-stack plan-view">
      <SectionTabs
        label="Plan sections"
        idPrefix="plan"
        active={active}
        onSelect={onSection}
        items={[
          { id: "week", label: "This week", icon: ListChecks },
          { id: "roadmap", label: "Full plan", icon: CalendarDays },
          { id: "sessions", label: "Session notes", icon: GraduationCap },
          ...(materials ? [{ id: "materials" as const, label: "Session materials", icon: FileText }] : []),
        ]}
      />
      <SectionPanel idPrefix="plan" active={active}>
        {active === "week" && week}
        {active === "roadmap" && roadmap}
        {active === "sessions" && sessions}
        {active === "materials" && materials}
      </SectionPanel>
    </div>
  );
}
