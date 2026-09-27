import { Archive, ClipboardCheck, TimerReset } from "lucide-react";
import type { ReactNode } from "react";
import { useShellBusy } from "../lib/shellBusy";
import { SectionPanel, SectionTabs } from "./shared";

/**
 * Practice › Practise / Mistakes / Tests. The `#practice/<segment>` hash
 * carries both the section and Practice Coach's one-shot intents:
 * `mistakes`, `tests` and `tests-<moduleId>` pick a section; anything else
 * (an intent, a module set, or nothing) is Practise.
 */
export type PracticeSection = "practise" | "mistakes" | "tests";

const TEST_PREFIX = "tests-";

export function practiceSectionFor(segment: string): PracticeSection {
  if (segment === "mistakes") return "mistakes";
  if (segment === "tests" || segment.startsWith(TEST_PREFIX)) return "tests";
  return "practise";
}

/** `tests-<moduleId>` → the module test to open; otherwise "". */
export function practiceTestModule(segment: string): string {
  return segment.startsWith(TEST_PREFIX) ? segment.slice(TEST_PREFIX.length) : "";
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
  tests,
}: {
  segment: string;
  onSegment: (segment: string) => void;
  dueRetests: number;
  practise: ReactNode;
  mistakes: ReactNode;
  tests: ReactNode;
}) {
  const busy = useShellBusy();
  const section = practiceSectionFor(segment);
  // A running module test must never be unmounted: it holds the timed,
  // single-attempt run and the exam lock. Keep it mounted (hidden) while busy.
  const keepTestsMounted = busy === "mock";
  return (
    <div className="view-stack practice-hub">
      <SectionTabs
        label="Practice sections"
        idPrefix="practice"
        active={section}
        onSelect={(next) => onSegment(practiceSectionSegment(next))}
        disabled={busy === "mock" || busy === "practice"}
        items={[
          { id: "practise", label: "Practise", icon: TimerReset },
          { id: "mistakes", label: "Mistakes", icon: Archive, count: dueRetests },
          { id: "tests", label: "Module tests", icon: ClipboardCheck },
        ]}
      />
      <SectionPanel idPrefix="practice" active={section}>
        {section === "practise" && practise}
        {section === "mistakes" && mistakes}
        {(section === "tests" || keepTestsMounted) && <div hidden={section !== "tests"}>{tests}</div>}
      </SectionPanel>
    </div>
  );
}
