import { describe, expect, it } from "vitest";
import { PLAN } from "./plan";
import {
  ASSIGNED_SESSION_COUNT,
  CANONICAL_ASSIGNMENT_COUNT,
  CANONICAL_READING_COUNT,
  normalizeReadingTopic,
  RAW_ASSIGNMENT_COUNT,
  RAW_READING_COUNT,
  READING_CATALOG,
  READING_INDEX,
} from "./readings";

const sessions = PLAN.flatMap((week) => [
  week.session1,
  week.session2,
  week.session3,
]);

describe("audited attached-reading crosswalk", () => {
  it("preserves exact raw, canonical, status, and assignment counts", () => {
    expect(READING_CATALOG.sources).toHaveLength(4);
    expect(RAW_READING_COUNT).toBe(77);
    expect(CANONICAL_READING_COUNT).toBe(57);
    expect(RAW_ASSIGNMENT_COUNT).toBe(91);
    expect(CANONICAL_ASSIGNMENT_COUNT).toBe(67);
    expect(ASSIGNED_SESSION_COUNT).toBe(39);

    expect(
      READING_CATALOG.readings.filter(
        (reading) => reading.curriculumStatus === "aligned",
      ),
    ).toHaveLength(33);
    expect(
      READING_CATALOG.readings.filter(
        (reading) => reading.curriculumStatus === "supplement",
      ),
    ).toHaveLength(22);
    expect(
      READING_CATALOG.readings.filter(
        (reading) => reading.curriculumStatus === "legacy",
      ),
    ).toHaveLength(22);
  });

  it("uses unique ids and maps every reading to exactly one attached source", () => {
    const sourceIds = READING_CATALOG.sources.map((source) => source.id);
    const readingIds = READING_CATALOG.readings.map((reading) => reading.id);
    expect(new Set(sourceIds).size).toBe(sourceIds.length);
    expect(new Set(readingIds).size).toBe(readingIds.length);

    for (const reading of READING_CATALOG.readings) {
      const matchingSources = sourceIds.filter((sourceId) =>
        reading.id.startsWith(`${sourceId}-`),
      );
      expect(matchingSources).toHaveLength(1);
      expect(Number(reading.id.match(/-r(\d+)$/)?.[1])).toBe(reading.number);
      expect(reading.authority).toBe("supplementary");
    }
  });

  it("assigns all 77 readings bidirectionally to valid Sessions 01–87", () => {
    const validSessionNumbers = new Set(sessions.map((session) => session.number));
    const catalogPairs = new Set<string>();

    for (const reading of READING_CATALOG.readings) {
      expect(reading.sessionNumbers.length).toBeGreaterThan(0);
      expect(new Set(reading.sessionNumbers).size).toBe(
        reading.sessionNumbers.length,
      );
      for (const sessionNumber of reading.sessionNumbers) {
        expect(validSessionNumbers.has(sessionNumber)).toBe(true);
        catalogPairs.add(`${reading.id}:${sessionNumber}`);
      }
    }

    const planPairs = new Set(
      sessions.flatMap((session) =>
        session.readings.map((readingId) => `${readingId}:${session.number}`),
      ),
    );
    expect(planPairs.size).toBe(91);
    expect([...planPairs].sort()).toEqual([...catalogPairs].sort());

    const coveredReadingIds = new Set(
      sessions.flatMap((session) => session.readings),
    );
    expect(coveredReadingIds.size).toBe(77);
    for (const reading of READING_CATALOG.readings) {
      expect(coveredReadingIds.has(reading.id)).toBe(true);
    }
  });

  it("preserves all 20 legacy duplicate-to-primary relationships", () => {
    const duplicates = READING_CATALOG.readings.filter(
      (reading) => reading.primaryEquivalent,
    );
    expect(duplicates).toHaveLength(20);

    for (const duplicate of duplicates) {
      expect(duplicate.curriculumStatus).toBe("legacy");
      expect(duplicate.primaryEquivalent).not.toBe(duplicate.id);
      const primary = READING_INDEX.get(duplicate.primaryEquivalent!);
      expect(primary).toBeDefined();
      expect(primary?.primaryEquivalent).toBeNull();
      expect(primary?.title).toBe(duplicate.title);
      expect(primary?.sessionNumbers).toEqual(duplicate.sessionNumbers);
    }
  });

  it("distinguishes attached coverage, missing 2027 sources, and review-only sessions", () => {
    const covered = new Set(
      READING_CATALOG.readings.flatMap((reading) => reading.sessionNumbers),
    );
    expect([...covered].sort((a, b) => a - b)).toEqual([
      4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15,
      19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33,
      43, 44, 45, 46, 47, 48, 49, 50, 51, 52, 53, 54,
    ]);

    const missingOfficialSourceSessions = [
      16, 17, 18,
      34, 35, 36, 37, 38, 39,
      40, 41, 42,
    ];
    const intentionalNoNewReadingSessions = [
      1, 2, 3,
      ...Array.from({ length: 33 }, (_, index) => index + 55),
    ];
    for (const number of [
      ...missingOfficialSourceSessions,
      ...intentionalNoNewReadingSessions,
    ]) {
      expect(covered.has(number)).toBe(false);
    }
  });

  it("normalizes the 2027 Portfolio topic label", () => {
    expect(normalizeReadingTopic("Portfolio Construction")).toBe(
      "Portfolio Management",
    );
    expect(normalizeReadingTopic("Equity Investments")).toBe(
      "Equity Investments",
    );
  });
});
