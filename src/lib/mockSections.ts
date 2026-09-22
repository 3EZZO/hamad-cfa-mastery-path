import type { MockScore, MockScoreSection } from "../types";

export interface MockSectionSummary extends MockScoreSection {
  accuracy: number;
}

/** Accuracy per section, weakest first; empty when the mock has no breakdown. */
export function summarizeMockSections(mock: Pick<MockScore, "sections">): MockSectionSummary[] {
  return (mock.sections ?? [])
    .filter((section) => section.attempted > 0)
    .map((section) => ({
      ...section,
      accuracy: Math.round((section.correct / section.attempted) * 100),
    }))
    .sort((a, b) => a.accuracy - b.accuracy || a.topic.localeCompare(b.topic));
}

/**
 * Sections that fell clearly short of the mock's target. The threshold sits
 * ten points under the headline target so a single unlucky section does not
 * shout; below 50% is always weak.
 */
export function weakMockSections(
  mock: Pick<MockScore, "sections">,
  targetScore: number,
): MockSectionSummary[] {
  return summarizeMockSections(mock).filter(
    (section) => section.accuracy < targetScore - 10 || section.accuracy < 50,
  );
}

/** Short chip text such as "Quant 12/18 · 67%". */
export function formatMockSection(section: MockSectionSummary, shortTopic: (topic: string) => string): string {
  return `${shortTopic(section.topic)} ${section.correct}/${section.attempted} · ${section.accuracy}%`;
}
