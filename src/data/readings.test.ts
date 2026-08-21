import { describe, expect, it } from "vitest";
import { getWeekSessions, PLAN } from "./plan";
import {
  ASSIGNED_SESSION_COUNT,
  CANONICAL_ASSIGNMENT_COUNT,
  CANONICAL_READING_COUNT,
  normalizeReadingTopic,
  RAW_ASSIGNMENT_COUNT,
  RAW_READING_COUNT,
  READING_CATALOG,
} from "./readings";

const sessions = PLAN.flatMap(getWeekSessions);

describe("official 2027 curriculum map", () => {
  it("contains one authoritative source and all 102 official modules", () => {
    expect(READING_CATALOG.sources).toHaveLength(1);
    expect(READING_CATALOG.sources[0]).toMatchObject({
      id: "cfa-2027-outline",
      editionYear: 2027,
      authority: "official",
    });
    expect(READING_CATALOG.sources[0]?.url).toContain(
      "2027levelitopicoutline_online.pdf",
    );
    expect(RAW_READING_COUNT).toBe(102);
    expect(CANONICAL_READING_COUNT).toBe(102);
    expect(RAW_ASSIGNMENT_COUNT).toBe(102);
    expect(CANONICAL_ASSIGNMENT_COUNT).toBe(102);
    expect(ASSIGNED_SESSION_COUNT).toBe(17);
  });

  it("preserves the official module counts across all ten topics", () => {
    const counts = Object.fromEntries(
      [
        "Quantitative Methods",
        "Economics",
        "Corporate Issuers",
        "Financial Statement Analysis",
        "Equity Investments",
        "Fixed Income",
        "Derivatives",
        "Alternative Investments",
        "Portfolio Management",
        "Ethical and Professional Standards",
      ].map((topic) => [
        topic,
        READING_CATALOG.readings.filter((reading) => reading.topic === topic)
          .length,
      ]),
    );
    expect(counts).toEqual({
      "Quantitative Methods": 11,
      Economics: 8,
      "Corporate Issuers": 7,
      "Financial Statement Analysis": 12,
      "Equity Investments": 12,
      "Fixed Income": 19,
      Derivatives: 10,
      "Alternative Investments": 7,
      "Portfolio Management": 6,
      "Ethical and Professional Standards": 10,
    });
  });

  it("uses unique sequential ids and official metadata only", () => {
    const ids = READING_CATALOG.readings.map((reading) => reading.id);
    expect(new Set(ids).size).toBe(102);
    expect(ids).toEqual(
      Array.from(
        { length: 102 },
        (_, index) => `cfa-2027-outline-m${String(index + 1).padStart(3, "0")}`,
      ),
    );
    for (const reading of READING_CATALOG.readings) {
      expect(reading.authority).toBe("official");
      expect(reading.curriculumStatus).toBe("official");
      expect(reading.primaryEquivalent).toBeNull();
      expect(reading.sessionNumbers).toHaveLength(1);
    }
  });

  it("maps every module bidirectionally to Checkpoints 01-17", () => {
    const catalogPairs = new Set(
      READING_CATALOG.readings.flatMap((reading) =>
        reading.sessionNumbers.map(
          (sessionNumber) => `${reading.id}:${sessionNumber}`,
        ),
      ),
    );
    const planPairs = new Set(
      sessions.flatMap((session) =>
        session.readings.map((readingId) => `${readingId}:${session.number}`),
      ),
    );
    expect(planPairs).toEqual(catalogPairs);
    expect(
      [...new Set(READING_CATALOG.readings.flatMap((reading) => reading.sessionNumbers))],
    ).toEqual(Array.from({ length: 17 }, (_, index) => index + 1));
    expect(sessions.slice(17).every((session) => session.readings.length === 0)).toBe(
      true,
    );
  });

  it("normalizes the public outline headings to exam-topic labels", () => {
    expect(normalizeReadingTopic("Corporate Finance")).toBe(
      "Corporate Issuers",
    );
    expect(normalizeReadingTopic("Equities")).toBe("Equity Investments");
    expect(normalizeReadingTopic("Portfolio Construction")).toBe(
      "Portfolio Management",
    );
  });

  it("contains no prior-edition or legacy curriculum data", () => {
    const serialized = JSON.stringify(READING_CATALOG).toLowerCase();
    expect(serialized).not.toContain("2024");
    expect(serialized).not.toContain("2025");
    expect(serialized).not.toContain("legacy");
    expect(serialized).not.toContain("schweser");
  });
});
