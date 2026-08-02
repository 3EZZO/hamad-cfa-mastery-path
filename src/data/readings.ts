import catalog from "./readings.json";

export type CurriculumStatus = "aligned" | "supplement" | "legacy";

export interface ReadingSource {
  id: string;
  fileName: string;
  title: string;
  editionYear: number;
  publishedYear: number;
  authority: "supplementary";
}

export interface ReadingCatalogEntry {
  id: string;
  number: number;
  title: string;
  topic: string;
  pageRange: string;
  authority: "supplementary";
  curriculumStatus: CurriculumStatus;
  primaryEquivalent: string | null;
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
    throw new Error("Reading catalog must be an object.");
  }
  const candidate = value as Partial<ReadingCatalog>;
  if (
    typeof candidate.catalogId !== "string" ||
    typeof candidate.pageRangeBasis !== "string" ||
    !Array.isArray(candidate.sources) ||
    !Array.isArray(candidate.coverageNotes) ||
    !Array.isArray(candidate.readings)
  ) {
    throw new Error("Reading catalog has an invalid top-level schema.");
  }

  const sourceIds = new Set<string>();
  for (const source of candidate.sources) {
    if (!source.id || sourceIds.has(source.id)) {
      throw new Error(`Invalid or duplicate reading source id: ${source.id}`);
    }
    sourceIds.add(source.id);
  }

  const readingIds = new Set<string>();
  for (const reading of candidate.readings) {
    if (!reading.id || readingIds.has(reading.id)) {
      throw new Error(`Invalid or duplicate reading id: ${reading.id}`);
    }
    if (
      !["aligned", "supplement", "legacy"].includes(reading.curriculumStatus) ||
      !Array.isArray(reading.sessionNumbers) ||
      reading.sessionNumbers.length === 0
    ) {
      throw new Error(`Invalid reading metadata: ${reading.id}`);
    }
    const matchingSources = candidate.sources.filter((source) =>
      reading.id.startsWith(`${source.id}-`),
    );
    if (matchingSources.length !== 1) {
      throw new Error(`Reading ${reading.id} must match exactly one source.`);
    }
    readingIds.add(reading.id);
  }

  for (const reading of candidate.readings) {
    if (reading.primaryEquivalent && !readingIds.has(reading.primaryEquivalent)) {
      throw new Error(
        `Reading ${reading.id} has unknown primary equivalent ${reading.primaryEquivalent}.`,
      );
    }
  }
  return candidate as ReadingCatalog;
}

export const READING_CATALOG = validateCatalog(catalog);

export const TOPIC_ALIASES: Record<string, string> = {
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
  if (!source) throw new Error(`No source found for reading ${reading.id}`);
  return source;
}

export const READING_INDEX = new Map<string, ResolvedReading>(
  READING_CATALOG.readings.map((reading) => [
    reading.id,
    { ...reading, source: sourceForReading(reading) },
  ]),
);

export const RAW_READING_COUNT = READING_CATALOG.readings.length;
export const CANONICAL_READING_COUNT = new Set(
  READING_CATALOG.readings.map((reading) =>
    reading.primaryEquivalent ?? reading.id,
  ),
).size;
export const RAW_ASSIGNMENT_COUNT = READING_CATALOG.readings.reduce(
  (total, reading) => total + reading.sessionNumbers.length,
  0,
);
export const CANONICAL_ASSIGNMENT_COUNT = new Set(
  READING_CATALOG.readings.flatMap((reading) =>
    reading.sessionNumbers.map(
      (sessionNumber) =>
        `${reading.primaryEquivalent ?? reading.id}:${sessionNumber}`,
    ),
  ),
).size;
export const ASSIGNED_SESSION_COUNT = new Set(
  READING_CATALOG.readings.flatMap((reading) => reading.sessionNumbers),
).size;

export function resolveReadingIds(ids: string[]): ResolvedReading[] {
  return ids
    .map((id) => READING_INDEX.get(id))
    .filter((reading): reading is ResolvedReading => Boolean(reading));
}

export function shortSourceLabel(source: ReadingSource): string {
  const match = source.id.match(/^b(\d+)-(\d{4})$/);
  return match ? `${match[2]} Book ${match[1]}` : source.title;
}
