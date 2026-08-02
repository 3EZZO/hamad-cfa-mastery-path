import catalog from "./readings.json";

export type CurriculumStatus = "official";

export interface ReadingSource {
  id: string;
  fileName: string;
  title: string;
  editionYear: 2027;
  publishedYear: number;
  authority: "official";
  url: string;
}

export interface ReadingCatalogEntry {
  id: string;
  number: number;
  title: string;
  topic: string;
  pageRange: string;
  authority: "official";
  curriculumStatus: CurriculumStatus;
  primaryEquivalent: null;
  notes: string;
  sessionNumbers: number[];
}

export interface ReadingCatalog {
  catalogId: string;
  pageRangeBasis: string;
  sources: ReadingSource[];
  coverageNotes: string[];
  readings: ReadingCatalogEntry[];
}

export interface ResolvedReading extends ReadingCatalogEntry {
  source: ReadingSource;
}

function validateCatalog(value: unknown): ReadingCatalog {
  if (typeof value !== "object" || value === null) {
    throw new Error("Curriculum catalog must be an object.");
  }
  const candidate = value as Partial<ReadingCatalog>;
  if (
    typeof candidate.catalogId !== "string" ||
    typeof candidate.pageRangeBasis !== "string" ||
    !Array.isArray(candidate.sources) ||
    !Array.isArray(candidate.coverageNotes) ||
    !Array.isArray(candidate.readings)
  ) {
    throw new Error("Curriculum catalog has an invalid top-level schema.");
  }

  const sourceIds = new Set<string>();
  for (const source of candidate.sources) {
    if (
      !source.id ||
      sourceIds.has(source.id) ||
      source.editionYear !== 2027 ||
      source.authority !== "official" ||
      !source.url
    ) {
      throw new Error(`Invalid official curriculum source: ${source.id}`);
    }
    sourceIds.add(source.id);
  }

  const readingIds = new Set<string>();
  for (const reading of candidate.readings) {
    if (!reading.id || readingIds.has(reading.id)) {
      throw new Error(`Invalid or duplicate module id: ${reading.id}`);
    }
    if (
      reading.curriculumStatus !== "official" ||
      reading.authority !== "official" ||
      reading.primaryEquivalent !== null ||
      !Array.isArray(reading.sessionNumbers) ||
      reading.sessionNumbers.length === 0
    ) {
      throw new Error(`Invalid official module metadata: ${reading.id}`);
    }
    const matchingSources = candidate.sources.filter((source) =>
      reading.id.startsWith(`${source.id}-`),
    );
    if (matchingSources.length !== 1) {
      throw new Error(`Module ${reading.id} must match exactly one source.`);
    }
    readingIds.add(reading.id);
  }
  return candidate as ReadingCatalog;
}

export const READING_CATALOG = validateCatalog(catalog);

export const TOPIC_ALIASES: Record<string, string> = {
  "Corporate Finance": "Corporate Issuers",
  Equities: "Equity Investments",
  "Portfolio Construction": "Portfolio Management",
};

export function normalizeReadingTopic(topic: string): string {
  return TOPIC_ALIASES[topic] ?? topic;
}

export const READING_SOURCE_INDEX = new Map(
  READING_CATALOG.sources.map((source) => [source.id, source]),
);

function sourceForReading(reading: ReadingCatalogEntry): ReadingSource {
  const source = READING_CATALOG.sources.find((candidate) =>
    reading.id.startsWith(`${candidate.id}-`),
  );
  if (!source) throw new Error(`No source found for module ${reading.id}`);
  return source;
}

export const READING_INDEX = new Map<string, ResolvedReading>(
  READING_CATALOG.readings.map((reading) => [
    reading.id,
    { ...reading, source: sourceForReading(reading) },
  ]),
);

export const RAW_READING_COUNT = READING_CATALOG.readings.length;
export const CANONICAL_READING_COUNT = RAW_READING_COUNT;
export const RAW_ASSIGNMENT_COUNT = READING_CATALOG.readings.reduce(
  (total, reading) => total + reading.sessionNumbers.length,
  0,
);
export const CANONICAL_ASSIGNMENT_COUNT = RAW_ASSIGNMENT_COUNT;
export const ASSIGNED_SESSION_COUNT = new Set(
  READING_CATALOG.readings.flatMap((reading) => reading.sessionNumbers),
).size;

export function resolveReadingIds(ids: string[]): ResolvedReading[] {
  return ids
    .map((id) => READING_INDEX.get(id))
    .filter((reading): reading is ResolvedReading => Boolean(reading));
}

export function shortSourceLabel(_source: ReadingSource): string {
  return "2027 CFA Institute";
}
