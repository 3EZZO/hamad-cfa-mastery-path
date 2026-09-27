import { Archive, TimerReset } from "lucide-react";
import type { ReactNode } from "react";
import { useShellBusy } from "../lib/shellBusy";
import { SectionPanel, SectionTabs } from "./shared";

/**
 * Practice › Practise / Mistakes. The `#practice/<segment>` hash carries
 * both the section and Practice Coach's one-shot intents: `mistakes` picks
 * Mistake Review; anything else (an intent, a module set, or nothing) is
 * Practise. Module tests have their own destination.
 */
export type PracticeSection = "practise" | "mistakes";

export function practiceSectionFor(segment: string): PracticeSection {
  return segment === "mistakes" ? "mistakes" : "practise";
}

export function practiceSectionSegment(section: PracticeSection): string {
  return section === "practise" ? "" : section;
}

export function PracticeHubView({
  segment,
  onSegment,
  dueRetests,
  practise,
  mistakes,
}: {
  segment: string;
  onSegment: (segment: string) => void;
  dueRetests: number;
  practise: ReactNode;
  mistakes: ReactNode;
}) {
  const busy = useShellBusy();
  const section = practiceSectionFor(segment);
  return (
    <div className="view-stack practice-hub">
      <SectionTabs
        label="Practice sections"
        idPrefix="practice"
        active={section}
        onSelect={(next) => onSegment(practiceSectionSegment(next))}
        // Switching away mid-set would unmount the run; finish or leave it first.
        disabled={busy === "practice"}
        items={[
          { id: "practise", label: "Practise", icon: TimerReset },
          { id: "mistakes", label: "Mistakes", icon: Archive, count: dueRetests },
        ]}
      />
      <SectionPanel idPrefix="practice" active={section}>
        {section === "practise" && practise}
        {section === "mistakes" && mistakes}
      </SectionPanel>
    </div>
  );
}
