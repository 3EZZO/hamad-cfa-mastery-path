export const TUTOR_PLAYBOOK_SCHEMA_VERSION = 1 as const;
export const TUTOR_LIVE_RUN_SCHEMA_VERSION = 1 as const;

export const MAX_TUTOR_PLAYBOOK_CHUNKS = 200;
export const MAX_TUTOR_PLAYBOOK_CHUNK_BYTES = 450_000;
export const MAX_TUTOR_LIVE_RUN_EVENTS = 1_000;
export const MAX_TUTOR_LIVE_RUN_BYTES = 800_000;

const ID_PATTERN = /^[a-z0-9][a-z0-9._-]{0,79}$/;
const HASH_PATTERN = /^[a-f0-9]{64}$/;
const MAX_SESSION_NUMBER = 25;
const MAX_SESSION_SECONDS = 8 * 60 * 60;

export const TUTOR_PLAYBOOK_CHUNK_KINDS = [
  "route",
  "stage",
  "reference",
  "questions",
  "solutions",
  "repair",
  "appendix",
] as const;

export type TutorPlaybookChunkKind =
  (typeof TUTOR_PLAYBOOK_CHUNK_KINDS)[number];

export const TUTOR_PLAYBOOK_CARD_KINDS = [
  "instruction",
  "explanation",
  "formula",
  "demonstration",
  "guided-practice",
  "question",
  "solution",
  "repair",
  "checkpoint",
  "reference",
  "note",
] as const;

export type TutorPlaybookCardKind =
  (typeof TUTOR_PLAYBOOK_CARD_KINDS)[number];

export const TUTOR_ERROR_CODES = [
  "D",
  "T",
  "P",
  "S",
  "A",
  "I",
  "C",
  "OTHER",
] as const;

export type TutorErrorCode = (typeof TUTOR_ERROR_CODES)[number];

export interface TutorPlaybookRoute {
  id: string;
  label: string;
  totalMinutes: number;
  stageIds: string[];
  /**
   * Optional curated card order for each stage. When omitted, Session Mode
   * preserves the original behaviour and presents every card in that stage.
   */
  cardIdsByStage?: Record<string, string[]>;
}

export interface TutorPlaybookCard {
  id: string;
  kind: TutorPlaybookCardKind;
  title: string;
  body: string;
  say: string[];
  write: string[];
  ask: string[];
  prompt: string;
  answer: string;
  rationale: string;
  listenFor: string[];
  ifWrong: string[];
  hints: string[];
  masteryEvidence: string[];
  errorTags: TutorErrorCode[];
  expectedSeconds: number | null;
  difficulty: number | null;
}

export interface TutorPlaybookStage {
  id: string;
  title: string;
  objective: string;
  durationMinutesByRoute: Record<string, number>;
  cards: TutorPlaybookCard[];
}

export interface TutorPlaybookManifestDraft {
  schemaVersion: typeof TUTOR_PLAYBOOK_SCHEMA_VERSION;
  id: string;
  sessionNumber: number;
  title: string;
  version: string;
  contentHash: string;
  defaultRouteId: string;
  routes: TutorPlaybookRoute[];
  chunkIds: string[];
}

export interface TutorPlaybookChunkDraft {
  schemaVersion: typeof TUTOR_PLAYBOOK_SCHEMA_VERSION;
  id: string;
  order: number;
  kind: TutorPlaybookChunkKind;
  title: string;
  contentHash: string;
  stages: TutorPlaybookStage[];
}

export interface TutorPlaybookPackageDraft {
  manifest: TutorPlaybookManifestDraft;
  chunks: TutorPlaybookChunkDraft[];
}

export interface TutorPlaybookManifest extends TutorPlaybookManifestDraft {
  revision: number;
  publishedBy: string;
  publishedAtClient: string;
}

export interface TutorPlaybookChunk extends TutorPlaybookChunkDraft {
  playbookId: string;
  version: string;
  storageId: string;
  publishedBy: string;
  publishedAtClient: string;
}

export interface TutorPlaybookPackage {
  manifest: TutorPlaybookManifest;
  chunks: TutorPlaybookChunk[];
}

export const TUTOR_LIVE_RUN_STATUSES = [
  "running",
  "paused",
  "completed",
  "abandoned",
] as const;

export type TutorLiveRunStatus = (typeof TUTOR_LIVE_RUN_STATUSES)[number];

export const TUTOR_LIVE_RUN_ACTION_TYPES = [
  "start",
  "pause",
  "resume",
  "navigate",
  "assessment",
  "repair",
  "note",
  "complete",
  "abandon",
] as const;

export type TutorLiveRunActionType =
  (typeof TUTOR_LIVE_RUN_ACTION_TYPES)[number];

export type TutorAssessmentResult =
  | "correct"
  | "partial"
  | "repair"
  | "parked";

export type TutorMasteryDecision = "green" | "amber" | "red";

export interface TutorLiveRunMasteryDecision {
  stageId: string;
  stageTitle: string;
  decision: TutorMasteryDecision;
}

export interface TutorLiveRunCloseout {
  mastery: TutorLiveRunMasteryDecision[];
  outcome: string;
  nextAction: string;
  homework: string;
  delayedRetest: string;
  privateTutorNote: string;
}

export interface TutorLiveRunAction {
  id: string;
  type: TutorLiveRunActionType;
  atClient: string;
  elapsedSeconds: number;
  stageId?: string;
  cardId?: string | null;
  result?: TutorAssessmentResult;
  confidence?: number;
  errorCodes?: TutorErrorCode[];
  note?: string;
  closeout?: TutorLiveRunCloseout;
}

export interface TutorLiveRunSaveRequest {
  runId: string;
  playbookId: string;
  playbookVersion: string;
  sessionNumber: number;
  routeId: string;
  expectedRevision: number;
  action: TutorLiveRunAction;
}

export interface TutorLiveRun {
  schemaVersion: typeof TUTOR_LIVE_RUN_SCHEMA_VERSION;
  id: string;
  playbookId: string;
  playbookVersion: string;
  sessionNumber: number;
  routeId: string;
  status: TutorLiveRunStatus;
  currentStageId: string;
  currentCardId: string | null;
  elapsedSeconds: number;
  startedAtClient: string;
  endedAtClient: string | null;
  events: TutorLiveRunAction[];
  revision: number;
  updatedBy: string;
  updatedAtClient: string;
}

export class TutorContentValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TutorContentValidationError";
  }
}

export class TutorLiveRunConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TutorLiveRunConflictError";
  }
}

function fail(path: string, message: string): never {
  throw new TutorContentValidationError(`${path}: ${message}`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function record(value: unknown, path: string): Record<string, unknown> {
  if (!isRecord(value)) fail(path, "must be an object");
  return value;
}

function onlyKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
  path: string,
): void {
  const unexpected = Object.keys(value).filter((key) => !allowed.includes(key));
  if (unexpected.length) {
    fail(path, `contains unsupported fields: ${unexpected.join(", ")}`);
  }
}

function requiredString(
  value: unknown,
  path: string,
  maxLength: number,
): string {
  if (typeof value !== "string") fail(path, "must be a string");
  const normalized = value.trim();
  if (!normalized) fail(path, "must not be empty");
  if (normalized.length > maxLength) {
    fail(path, `must be at most ${maxLength} characters`);
  }
  return normalized;
}

function optionalString(
  value: unknown,
  path: string,
  maxLength: number,
): string {
  if (value === undefined) return "";
  if (typeof value !== "string") fail(path, "must be a string");
  if (value.length > maxLength) {
    fail(path, `must be at most ${maxLength} characters`);
  }
  return value.trim();
}

function identifier(value: unknown, path: string): string {
  const normalized = requiredString(value, path, 80).toLowerCase();
  if (!ID_PATTERN.test(normalized)) {
    fail(path, "must use lowercase letters, numbers, dots, underscores, or hyphens");
  }
  return normalized;
}

export function parseTutorContentId(value: unknown, path = "id"): string {
  return identifier(value, path);
}

function storageIdentifier(value: unknown, path: string): string {
  const normalized = requiredString(value, path, 244).toLowerCase();
  if (!/^[a-z0-9][a-z0-9._-]{0,243}$/.test(normalized)) {
    fail(path, "must be a safe Firestore document ID");
  }
  return normalized;
}

function hash(value: unknown, path: string): string {
  const normalized = requiredString(value, path, 64).toLowerCase();
  if (!HASH_PATTERN.test(normalized)) {
    fail(path, "must be a 64-character SHA-256 hex digest");
  }
  return normalized;
}

function integer(
  value: unknown,
  path: string,
  min: number,
  max: number,
): number {
  if (!Number.isSafeInteger(value) || Number(value) < min || Number(value) > max) {
    fail(path, `must be an integer between ${min} and ${max}`);
  }
  return Number(value);
}

function isoTimestamp(value: unknown, path: string): string {
  const normalized = requiredString(value, path, 40);
  const parsed = Date.parse(normalized);
  if (Number.isNaN(parsed) || new Date(parsed).toISOString() !== normalized) {
    fail(path, "must be a canonical UTC ISO timestamp");
  }
  return normalized;
}

function nullableTimestamp(value: unknown, path: string): string | null {
  return value === null ? null : isoTimestamp(value, path);
}

function stringList(
  value: unknown,
  path: string,
  maximumItems: number,
  maximumItemLength: number,
  defaultValue: string[] = [],
): string[] {
  if (value === undefined) return [...defaultValue];
  if (!Array.isArray(value)) fail(path, "must be a list");
  if (value.length > maximumItems) {
    fail(path, `must contain at most ${maximumItems} items`);
  }
  return value.map((item, index) =>
    requiredString(item, `${path}[${index}]`, maximumItemLength),
  );
}

function unique(values: readonly string[], path: string): void {
  if (new Set(values).size !== values.length) {
    fail(path, "must not contain duplicate IDs");
  }
}

function enumValue<T extends string>(
  value: unknown,
  allowed: readonly T[],
  path: string,
): T {
  if (typeof value !== "string" || !allowed.includes(value as T)) {
    fail(path, `must be one of: ${allowed.join(", ")}`);
  }
  return value as T;
}

function approximateUtf8Bytes(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}

function canonicalTutorContentValue(value: unknown, path = "content"): unknown {
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "string") return value.normalize("NFC");
  if (typeof value === "number") {
    if (!Number.isFinite(value)) fail(path, "contains a non-finite number");
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item, index) =>
      canonicalTutorContentValue(item, `${path}[${index}]`),
    );
  }
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [
          key,
          canonicalTutorContentValue(value[key], `${path}.${key}`),
        ]),
    );
  }
  fail(path, `contains unsupported ${typeof value} data`);
}

export function canonicalTutorContentJson(value: unknown): string {
  const encoded = JSON.stringify(canonicalTutorContentValue(value));
  if (typeof encoded !== "string") fail("content", "could not be serialized");
  return encoded;
}

async function sha256CanonicalTutorContent(value: unknown): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    throw new TutorContentValidationError(
      "SHA-256 verification is unavailable in this browser.",
    );
  }
  const digest = await subtle.digest(
    "SHA-256",
    new TextEncoder().encode(canonicalTutorContentJson(value)),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

export async function computeTutorPlaybookChunkContentHash(
  chunk: TutorPlaybookChunkDraft,
): Promise<string> {
  return sha256CanonicalTutorContent({
    schemaVersion: chunk.schemaVersion,
    id: chunk.id,
    order: chunk.order,
    kind: chunk.kind,
    title: chunk.title,
    stages: chunk.stages,
  });
}

export async function computeTutorPlaybookManifestContentHash(
  manifest: TutorPlaybookManifestDraft,
  chunks: readonly TutorPlaybookChunkDraft[],
): Promise<string> {
  const chunkHashes = [...chunks]
    .sort((left, right) => left.order - right.order)
    .map((chunk) => chunk.contentHash);
  return sha256CanonicalTutorContent({
    schemaVersion: manifest.schemaVersion,
    id: manifest.id,
    sessionNumber: manifest.sessionNumber,
    title: manifest.title,
    version: manifest.version,
    defaultRouteId: manifest.defaultRouteId,
    routes: manifest.routes,
    chunkIds: manifest.chunkIds,
    chunkHashes,
  });
}

function parseRoute(value: unknown, path: string): TutorPlaybookRoute {
  const source = record(value, path);
  onlyKeys(
    source,
    ["id", "label", "totalMinutes", "stageIds", "cardIdsByStage"],
    path,
  );
  const stageIds = stringList(source.stageIds, `${path}.stageIds`, 100, 80).map(
    (stageId, index) => identifier(stageId, `${path}.stageIds[${index}]`),
  );
  if (!stageIds.length) fail(`${path}.stageIds`, "must contain at least one stage");
  unique(stageIds, `${path}.stageIds`);
  let cardIdsByStage: Record<string, string[]> | undefined;
  if (source.cardIdsByStage !== undefined) {
    const cardsByStage = record(source.cardIdsByStage, `${path}.cardIdsByStage`);
    cardIdsByStage = Object.fromEntries(
      Object.entries(cardsByStage).map(([stageId, value]) => {
        const parsedStageId = identifier(stageId, `${path}.cardIdsByStage.${stageId}`);
        const cardIds = stringList(
          value,
          `${path}.cardIdsByStage.${stageId}`,
          400,
          80,
        ).map((cardId, index) =>
          identifier(cardId, `${path}.cardIdsByStage.${stageId}[${index}]`),
        );
        if (!cardIds.length) {
          fail(`${path}.cardIdsByStage.${stageId}`, "must contain at least one card");
        }
        unique(cardIds, `${path}.cardIdsByStage.${stageId}`);
        return [parsedStageId, cardIds];
      }),
    );
  }
  return {
    id: identifier(source.id, `${path}.id`),
    label: requiredString(source.label, `${path}.label`, 100),
    totalMinutes: integer(source.totalMinutes, `${path}.totalMinutes`, 1, 360),
    stageIds,
    ...(cardIdsByStage ? { cardIdsByStage } : {}),
  };
}

function parseErrorTags(value: unknown, path: string): TutorErrorCode[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) fail(path, "must be a list");
  if (value.length > TUTOR_ERROR_CODES.length) fail(path, "contains too many codes");
  const result = value.map((item, index) =>
    enumValue(item, TUTOR_ERROR_CODES, `${path}[${index}]`),
  );
  unique(result, path);
  return result;
}

function parseCard(value: unknown, path: string): TutorPlaybookCard {
  const source = record(value, path);
  onlyKeys(
    source,
    [
      "id",
      "kind",
      "title",
      "body",
      "say",
      "write",
      "ask",
      "prompt",
      "answer",
      "rationale",
      "listenFor",
      "ifWrong",
      "hints",
      "masteryEvidence",
      "errorTags",
      "expectedSeconds",
      "difficulty",
    ],
    path,
  );

  const card: TutorPlaybookCard = {
    id: identifier(source.id, `${path}.id`),
    kind: enumValue(source.kind, TUTOR_PLAYBOOK_CARD_KINDS, `${path}.kind`),
    title: optionalString(source.title, `${path}.title`, 200),
    body: optionalString(source.body, `${path}.body`, 20_000),
    say: stringList(source.say, `${path}.say`, 50, 4_000),
    write: stringList(source.write, `${path}.write`, 50, 4_000),
    ask: stringList(source.ask, `${path}.ask`, 50, 4_000),
    prompt: optionalString(source.prompt, `${path}.prompt`, 12_000),
    answer: optionalString(source.answer, `${path}.answer`, 20_000),
    rationale: optionalString(source.rationale, `${path}.rationale`, 20_000),
    listenFor: stringList(source.listenFor, `${path}.listenFor`, 50, 4_000),
    ifWrong: stringList(source.ifWrong, `${path}.ifWrong`, 50, 4_000),
    hints: stringList(source.hints, `${path}.hints`, 20, 4_000),
    masteryEvidence: stringList(
      source.masteryEvidence,
      `${path}.masteryEvidence`,
      30,
      4_000,
    ),
    errorTags: parseErrorTags(source.errorTags, `${path}.errorTags`),
    expectedSeconds:
      source.expectedSeconds === undefined || source.expectedSeconds === null
        ? null
        : integer(source.expectedSeconds, `${path}.expectedSeconds`, 1, 7_200),
    difficulty:
      source.difficulty === undefined || source.difficulty === null
        ? null
        : integer(source.difficulty, `${path}.difficulty`, 1, 5),
  };

  const hasContent = Boolean(
    card.title ||
      card.body ||
      card.say.length ||
      card.write.length ||
      card.ask.length ||
      card.prompt ||
      card.answer ||
      card.rationale ||
      card.listenFor.length ||
      card.ifWrong.length ||
      card.hints.length ||
      card.masteryEvidence.length,
  );
  if (!hasContent) fail(path, "must contain tutor-facing content");
  if (card.kind === "question" && (!card.prompt || !card.answer)) {
    fail(path, "question cards require both prompt and answer");
  }
  if (card.kind === "repair" && !card.body && !card.ifWrong.length) {
    fail(path, "repair cards require body or ifWrong instructions");
  }
  return card;
}

function parseDurations(
  value: unknown,
  path: string,
): Record<string, number> {
  const source = record(value, path);
  if (Object.keys(source).length > 4) fail(path, "supports at most four routes");
  return Object.fromEntries(
    Object.entries(source).map(([key, duration]) => [
      identifier(key, `${path}.${key}`),
      integer(duration, `${path}.${key}`, 0, 360),
    ]),
  );
}

function parseStage(value: unknown, path: string): TutorPlaybookStage {
  const source = record(value, path);
  onlyKeys(
    source,
    ["id", "title", "objective", "durationMinutesByRoute", "cards"],
    path,
  );
  if (!Array.isArray(source.cards) || !source.cards.length) {
    fail(`${path}.cards`, "must contain at least one card");
  }
  if (source.cards.length > 250) {
    fail(`${path}.cards`, "must contain at most 250 cards");
  }
  const cards = source.cards.map((card, index) =>
    parseCard(card, `${path}.cards[${index}]`),
  );
  unique(
    cards.map((card) => card.id),
    `${path}.cards`,
  );
  return {
    id: identifier(source.id, `${path}.id`),
    title: requiredString(source.title, `${path}.title`, 200),
    objective: requiredString(source.objective, `${path}.objective`, 2_000),
    durationMinutesByRoute: parseDurations(
      source.durationMinutesByRoute,
      `${path}.durationMinutesByRoute`,
    ),
    cards,
  };
}

export function parseTutorPlaybookManifestDraft(
  value: unknown,
  path = "manifest",
): TutorPlaybookManifestDraft {
  const source = record(value, path);
  onlyKeys(
    source,
    [
      "schemaVersion",
      "id",
      "sessionNumber",
      "title",
      "version",
      "contentHash",
      "defaultRouteId",
      "routes",
      "chunkIds",
    ],
    path,
  );
  if (source.schemaVersion !== TUTOR_PLAYBOOK_SCHEMA_VERSION) {
    fail(`${path}.schemaVersion`, `must equal ${TUTOR_PLAYBOOK_SCHEMA_VERSION}`);
  }
  if (!Array.isArray(source.routes) || !source.routes.length || source.routes.length > 4) {
    fail(`${path}.routes`, "must contain between one and four routes");
  }
  const routes = source.routes.map((route, index) =>
    parseRoute(route, `${path}.routes[${index}]`),
  );
  unique(
    routes.map((route) => route.id),
    `${path}.routes`,
  );
  const chunkIds = stringList(
    source.chunkIds,
    `${path}.chunkIds`,
    MAX_TUTOR_PLAYBOOK_CHUNKS,
    80,
  ).map((chunkId, index) =>
    identifier(chunkId, `${path}.chunkIds[${index}]`),
  );
  if (!chunkIds.length) fail(`${path}.chunkIds`, "must not be empty");
  unique(chunkIds, `${path}.chunkIds`);
  const defaultRouteId = identifier(
    source.defaultRouteId,
    `${path}.defaultRouteId`,
  );
  if (!routes.some((route) => route.id === defaultRouteId)) {
    fail(`${path}.defaultRouteId`, "must reference a declared route");
  }
  return {
    schemaVersion: TUTOR_PLAYBOOK_SCHEMA_VERSION,
    id: identifier(source.id, `${path}.id`),
    sessionNumber: integer(
      source.sessionNumber,
      `${path}.sessionNumber`,
      1,
      MAX_SESSION_NUMBER,
    ),
    title: requiredString(source.title, `${path}.title`, 240),
    version: identifier(source.version, `${path}.version`),
    contentHash: hash(source.contentHash, `${path}.contentHash`),
    defaultRouteId,
    routes,
    chunkIds,
  };
}

export function parseTutorPlaybookChunkDraft(
  value: unknown,
  path = "chunk",
): TutorPlaybookChunkDraft {
  if (approximateUtf8Bytes(value) > MAX_TUTOR_PLAYBOOK_CHUNK_BYTES) {
    fail(path, `exceeds the ${MAX_TUTOR_PLAYBOOK_CHUNK_BYTES}-byte safe limit`);
  }
  const source = record(value, path);
  onlyKeys(
    source,
    ["schemaVersion", "id", "order", "kind", "title", "contentHash", "stages"],
    path,
  );
  if (source.schemaVersion !== TUTOR_PLAYBOOK_SCHEMA_VERSION) {
    fail(`${path}.schemaVersion`, `must equal ${TUTOR_PLAYBOOK_SCHEMA_VERSION}`);
  }
  if (!Array.isArray(source.stages) || !source.stages.length) {
    fail(`${path}.stages`, "must contain at least one stage");
  }
  if (source.stages.length > 50) {
    fail(`${path}.stages`, "must contain at most 50 stages");
  }
  const stages = source.stages.map((stage, index) =>
    parseStage(stage, `${path}.stages[${index}]`),
  );
  unique(
    stages.map((stage) => stage.id),
    `${path}.stages`,
  );
  return {
    schemaVersion: TUTOR_PLAYBOOK_SCHEMA_VERSION,
    id: identifier(source.id, `${path}.id`),
    order: integer(source.order, `${path}.order`, 0, MAX_TUTOR_PLAYBOOK_CHUNKS - 1),
    kind: enumValue(source.kind, TUTOR_PLAYBOOK_CHUNK_KINDS, `${path}.kind`),
    title: requiredString(source.title, `${path}.title`, 240),
    contentHash: hash(source.contentHash, `${path}.contentHash`),
    stages,
  };
}

function validatePackageRelationships(
  manifest: TutorPlaybookManifestDraft,
  chunks: TutorPlaybookChunkDraft[],
): void {
  if (chunks.length !== manifest.chunkIds.length) {
    fail("chunks", "must match the manifest chunkIds exactly");
  }
  const orderedChunks = [...chunks].sort((left, right) => left.order - right.order);
  orderedChunks.forEach((chunk, index) => {
    if (chunk.order !== index) fail(`chunks[${index}].order`, "must be contiguous from zero");
    if (chunk.id !== manifest.chunkIds[index]) {
      fail(`manifest.chunkIds[${index}]`, "must match chunk order and ID");
    }
  });
  unique(
    chunks.map((chunk) => chunk.id),
    "chunks",
  );

  const allStages = orderedChunks.flatMap((chunk) => chunk.stages);
  unique(
    allStages.map((stage) => stage.id),
    "chunks.stages",
  );
  const stageById = new Map(allStages.map((stage) => [stage.id, stage]));
  const allCardIds = allStages.flatMap((stage) => stage.cards.map((card) => card.id));
  unique(allCardIds, "chunks.stages.cards");

  const routeIds = new Set(manifest.routes.map((route) => route.id));
  for (const stage of allStages) {
    for (const routeId of Object.keys(stage.durationMinutesByRoute)) {
      if (!routeIds.has(routeId)) {
        fail(
          `stage.${stage.id}.durationMinutesByRoute.${routeId}`,
          "references an undeclared route",
        );
      }
    }
  }

  for (const route of manifest.routes) {
    let total = 0;
    if (route.cardIdsByStage) {
      for (const stageId of Object.keys(route.cardIdsByStage)) {
        if (!route.stageIds.includes(stageId)) {
          fail(
            `route.${route.id}.cardIdsByStage.${stageId}`,
            "references a stage that is not in this route",
          );
        }
      }
    }
    for (const stageId of route.stageIds) {
      const stage = stageById.get(stageId);
      if (!stage) fail(`route.${route.id}`, `references missing stage ${stageId}`);
      const selectedCardIds = route.cardIdsByStage?.[stageId];
      if (selectedCardIds) {
        const stageCardIds = new Set(stage.cards.map((card) => card.id));
        for (const cardId of selectedCardIds) {
          if (!stageCardIds.has(cardId)) {
            fail(
              `route.${route.id}.cardIdsByStage.${stageId}`,
              `references missing card ${cardId}`,
            );
          }
        }
      }
      const duration = stage.durationMinutesByRoute[route.id];
      if (duration === undefined) {
        fail(
          `stage.${stageId}.durationMinutesByRoute`,
          `is missing duration for route ${route.id}`,
        );
      }
      total += duration;
    }
    if (total !== route.totalMinutes) {
      fail(
        `route.${route.id}.totalMinutes`,
        `declares ${route.totalMinutes}, but its stages total ${total}`,
      );
    }
  }
}

export function parseTutorPlaybookPackageDraft(
  value: unknown,
): TutorPlaybookPackageDraft {
  const source = record(value, "playbook");
  onlyKeys(source, ["manifest", "chunks"], "playbook");
  if (!Array.isArray(source.chunks)) fail("playbook.chunks", "must be a list");
  const manifest = parseTutorPlaybookManifestDraft(source.manifest);
  const chunks = source.chunks.map((chunk, index) =>
    parseTutorPlaybookChunkDraft(chunk, `chunks[${index}]`),
  );
  validatePackageRelationships(manifest, chunks);
  return {
    manifest,
    chunks: [...chunks].sort((left, right) => left.order - right.order),
  };
}

/**
 * Verifies the deterministic SHA-256 contract emitted by the private exporter.
 * Call this before the first Firestore write and after loading protected data.
 */
export async function verifyTutorPlaybookPackageIntegrity(
  value: unknown,
): Promise<TutorPlaybookPackageDraft> {
  const parsed = parseTutorPlaybookPackageDraft(value);
  for (const chunk of parsed.chunks) {
    const computed = await computeTutorPlaybookChunkContentHash(chunk);
    if (computed !== chunk.contentHash) {
      fail(`chunk.${chunk.id}.contentHash`, "does not match the chunk contents");
    }
  }
  const computedManifestHash = await computeTutorPlaybookManifestContentHash(
    parsed.manifest,
    parsed.chunks,
  );
  if (computedManifestHash !== parsed.manifest.contentHash) {
    fail("manifest.contentHash", "does not match the versioned package contents");
  }
  return parsed;
}

export function buildTutorPlaybookChunkStorageId(
  playbookId: string,
  version: string,
  chunkId: string,
): string {
  const safePlaybookId = identifier(playbookId, "playbookId");
  const safeVersion = identifier(version, "version");
  const safeChunkId = identifier(chunkId, "chunkId");
  return `${safePlaybookId}--${safeVersion}--${safeChunkId}`;
}

export function parseTutorPlaybookManifest(
  value: unknown,
): TutorPlaybookManifest {
  const source = record(value, "manifest");
  onlyKeys(
    source,
    [
      "schemaVersion",
      "id",
      "sessionNumber",
      "title",
      "version",
      "contentHash",
      "defaultRouteId",
      "routes",
      "chunkIds",
      "revision",
      "publishedBy",
      "publishedAtClient",
    ],
    "manifest",
  );
  const draft = parseTutorPlaybookManifestDraft({
    schemaVersion: source.schemaVersion,
    id: source.id,
    sessionNumber: source.sessionNumber,
    title: source.title,
    version: source.version,
    contentHash: source.contentHash,
    defaultRouteId: source.defaultRouteId,
    routes: source.routes,
    chunkIds: source.chunkIds,
  });
  return {
    ...draft,
    revision: integer(source.revision, "manifest.revision", 1, 1_000_000),
    publishedBy: requiredString(source.publishedBy, "manifest.publishedBy", 128),
    publishedAtClient: isoTimestamp(
      source.publishedAtClient,
      "manifest.publishedAtClient",
    ),
  };
}

export function parseTutorPlaybookChunk(value: unknown): TutorPlaybookChunk {
  if (approximateUtf8Bytes(value) > MAX_TUTOR_PLAYBOOK_CHUNK_BYTES + 2_000) {
    fail("chunk", "exceeds the safe published size limit");
  }
  const source = record(value, "chunk");
  onlyKeys(
    source,
    [
      "schemaVersion",
      "id",
      "order",
      "kind",
      "title",
      "contentHash",
      "stages",
      "playbookId",
      "version",
      "storageId",
      "publishedBy",
      "publishedAtClient",
    ],
    "chunk",
  );
  const draft = parseTutorPlaybookChunkDraft({
    schemaVersion: source.schemaVersion,
    id: source.id,
    order: source.order,
    kind: source.kind,
    title: source.title,
    contentHash: source.contentHash,
    stages: source.stages,
  });
  const playbookId = identifier(source.playbookId, "chunk.playbookId");
  const version = identifier(source.version, "chunk.version");
  const storageId = storageIdentifier(source.storageId, "chunk.storageId");
  const expectedStorageId = buildTutorPlaybookChunkStorageId(
    playbookId,
    version,
    draft.id,
  );
  if (storageId !== expectedStorageId) {
    fail("chunk.storageId", "does not match playbook, version, and chunk IDs");
  }
  return {
    ...draft,
    playbookId,
    version,
    storageId,
    publishedBy: requiredString(source.publishedBy, "chunk.publishedBy", 128),
    publishedAtClient: isoTimestamp(
      source.publishedAtClient,
      "chunk.publishedAtClient",
    ),
  };
}

export function validateTutorPlaybookPackage(
  manifest: TutorPlaybookManifest,
  chunks: TutorPlaybookChunk[],
): TutorPlaybookPackage {
  const draft = tutorPlaybookPackageToDraft(manifest, chunks);
  chunks.forEach((chunk, index) => {
    if (chunk.playbookId !== manifest.id || chunk.version !== manifest.version) {
      fail(`chunks[${index}]`, "does not belong to the active manifest version");
    }
  });
  const chunkById = new Map(chunks.map((chunk) => [chunk.id, chunk]));
  return {
    manifest,
    chunks: draft.chunks.map((chunk) => chunkById.get(chunk.id)!),
  };
}

export function tutorPlaybookPackageToDraft(
  manifest: TutorPlaybookManifest,
  chunks: readonly TutorPlaybookChunk[],
): TutorPlaybookPackageDraft {
  return parseTutorPlaybookPackageDraft({
    manifest: {
      schemaVersion: manifest.schemaVersion,
      id: manifest.id,
      sessionNumber: manifest.sessionNumber,
      title: manifest.title,
      version: manifest.version,
      contentHash: manifest.contentHash,
      defaultRouteId: manifest.defaultRouteId,
      routes: manifest.routes,
      chunkIds: manifest.chunkIds,
    },
    chunks: chunks.map((chunk) => ({
      schemaVersion: chunk.schemaVersion,
      id: chunk.id,
      order: chunk.order,
      kind: chunk.kind,
      title: chunk.title,
      contentHash: chunk.contentHash,
      stages: chunk.stages,
    })),
  });
}

export function parseTutorLiveRunCloseout(
  value: unknown,
  path = "closeout",
): TutorLiveRunCloseout {
  const source = record(value, path);
  onlyKeys(
    source,
    [
      "mastery",
      "outcome",
      "nextAction",
      "homework",
      "delayedRetest",
      "privateTutorNote",
    ],
    path,
  );
  if (!Array.isArray(source.mastery) || !source.mastery.length) {
    fail(`${path}.mastery`, "must contain at least one stage decision");
  }
  if (source.mastery.length > 100) {
    fail(`${path}.mastery`, "must contain at most 100 stage decisions");
  }
  const mastery = source.mastery.map((item, index) => {
    const itemPath = `${path}.mastery[${index}]`;
    const decision = record(item, itemPath);
    onlyKeys(decision, ["stageId", "stageTitle", "decision"], itemPath);
    return {
      stageId: identifier(decision.stageId, `${itemPath}.stageId`),
      stageTitle: requiredString(
        decision.stageTitle,
        `${itemPath}.stageTitle`,
        200,
      ),
      decision: enumValue(
        decision.decision,
        ["green", "amber", "red"] as const,
        `${itemPath}.decision`,
      ),
    };
  });
  unique(
    mastery.map((item) => item.stageId),
    `${path}.mastery`,
  );
  return {
    mastery,
    outcome: requiredString(source.outcome, `${path}.outcome`, 2_000),
    nextAction: requiredString(
      source.nextAction,
      `${path}.nextAction`,
      2_000,
    ),
    homework: requiredString(source.homework, `${path}.homework`, 4_000),
    delayedRetest: requiredString(
      source.delayedRetest,
      `${path}.delayedRetest`,
      4_000,
    ),
    privateTutorNote: optionalString(
      source.privateTutorNote,
      `${path}.privateTutorNote`,
      4_000,
    ),
  };
}

export function parseTutorLiveRunAction(
  value: unknown,
  path = "action",
): TutorLiveRunAction {
  const source = record(value, path);
  onlyKeys(
    source,
    [
      "id",
      "type",
      "atClient",
      "elapsedSeconds",
      "stageId",
      "cardId",
      "result",
      "confidence",
      "errorCodes",
      "note",
      "closeout",
    ],
    path,
  );
  const type = enumValue(source.type, TUTOR_LIVE_RUN_ACTION_TYPES, `${path}.type`);
  const action: TutorLiveRunAction = {
    id: identifier(source.id, `${path}.id`),
    type,
    atClient: isoTimestamp(source.atClient, `${path}.atClient`),
    elapsedSeconds: integer(
      source.elapsedSeconds,
      `${path}.elapsedSeconds`,
      0,
      MAX_SESSION_SECONDS,
    ),
  };
  if (source.stageId !== undefined) {
    action.stageId = identifier(source.stageId, `${path}.stageId`);
  }
  if (source.cardId !== undefined) {
    action.cardId =
      source.cardId === null ? null : identifier(source.cardId, `${path}.cardId`);
  }
  if (source.result !== undefined) {
    action.result = enumValue(
      source.result,
      ["correct", "partial", "repair", "parked"] as const,
      `${path}.result`,
    );
  }
  if (source.confidence !== undefined) {
    action.confidence = integer(
      source.confidence,
      `${path}.confidence`,
      1,
      5,
    );
  }
  if (source.errorCodes !== undefined) {
    action.errorCodes = parseErrorTags(source.errorCodes, `${path}.errorCodes`);
  }
  if (source.note !== undefined) {
    action.note = requiredString(source.note, `${path}.note`, 1_000);
  }
  if (source.closeout !== undefined) {
    action.closeout = parseTutorLiveRunCloseout(
      source.closeout,
      `${path}.closeout`,
    );
  }

  if ((type === "start" || type === "navigate") && !action.stageId) {
    fail(`${path}.stageId`, `is required for ${type}`);
  }
  if (
    (type === "assessment" || type === "repair") &&
    (!action.stageId || !action.cardId)
  ) {
    fail(path, `${type} requires both stageId and cardId`);
  }
  if (type === "assessment") {
    if (!action.result) fail(`${path}.result`, "is required for assessment");
    if (!action.confidence) {
      fail(`${path}.confidence`, "is required for assessment");
    }
    if (!action.errorCodes) {
      fail(`${path}.errorCodes`, "is required for assessment");
    }
    if (action.result === "correct" && action.errorCodes.length) {
      fail(`${path}.errorCodes`, "must be empty for a correct assessment");
    }
    if (action.result === "repair" && !action.errorCodes.length) {
      fail(`${path}.errorCodes`, "must identify the repair cause");
    }
    if (action.result === "parked" && !action.note) {
      fail(`${path}.note`, "is required when an assessment is parked");
    }
  } else if (action.result) {
    fail(`${path}.result`, "is allowed only for assessment");
  }
  if (type !== "assessment" && action.confidence) {
    fail(`${path}.confidence`, "is allowed only for assessment");
  }
  if (type === "repair") {
    if (!action.errorCodes?.length) {
      fail(`${path}.errorCodes`, "must identify at least one repair cause");
    }
  } else if (type !== "assessment" && action.errorCodes) {
    fail(`${path}.errorCodes`, "is allowed only for assessment or repair");
  }
  if (type === "note" && !action.note) {
    fail(`${path}.note`, "is required for note");
  }
  if (type === "complete" && !action.closeout) {
    fail(`${path}.closeout`, "is required when a run is completed");
  }
  if (type !== "complete" && action.closeout) {
    fail(`${path}.closeout`, "is allowed only for completion");
  }
  return action;
}

export function parseTutorLiveRunSaveRequest(
  value: unknown,
): TutorLiveRunSaveRequest {
  const source = record(value, "saveRequest");
  onlyKeys(
    source,
    [
      "runId",
      "playbookId",
      "playbookVersion",
      "sessionNumber",
      "routeId",
      "expectedRevision",
      "action",
    ],
    "saveRequest",
  );
  return {
    runId: identifier(source.runId, "saveRequest.runId"),
    playbookId: identifier(source.playbookId, "saveRequest.playbookId"),
    playbookVersion: identifier(
      source.playbookVersion,
      "saveRequest.playbookVersion",
    ),
    sessionNumber: integer(
      source.sessionNumber,
      "saveRequest.sessionNumber",
      1,
      MAX_SESSION_NUMBER,
    ),
    routeId: identifier(source.routeId, "saveRequest.routeId"),
    expectedRevision: integer(
      source.expectedRevision,
      "saveRequest.expectedRevision",
      0,
      1_000_000,
    ),
    action: parseTutorLiveRunAction(source.action),
  };
}

export function parseTutorLiveRun(value: unknown): TutorLiveRun {
  if (approximateUtf8Bytes(value) > MAX_TUTOR_LIVE_RUN_BYTES) {
    fail("liveRun", `exceeds the ${MAX_TUTOR_LIVE_RUN_BYTES}-byte safe limit`);
  }
  const source = record(value, "liveRun");
  onlyKeys(
    source,
    [
      "schemaVersion",
      "id",
      "playbookId",
      "playbookVersion",
      "sessionNumber",
      "routeId",
      "status",
      "currentStageId",
      "currentCardId",
      "elapsedSeconds",
      "startedAtClient",
      "endedAtClient",
      "events",
      "revision",
      "updatedBy",
      "updatedAtClient",
    ],
    "liveRun",
  );
  if (source.schemaVersion !== TUTOR_LIVE_RUN_SCHEMA_VERSION) {
    fail("liveRun.schemaVersion", `must equal ${TUTOR_LIVE_RUN_SCHEMA_VERSION}`);
  }
  if (!Array.isArray(source.events) || !source.events.length) {
    fail("liveRun.events", "must contain at least the start action");
  }
  if (source.events.length > MAX_TUTOR_LIVE_RUN_EVENTS) {
    fail("liveRun.events", `must contain at most ${MAX_TUTOR_LIVE_RUN_EVENTS} events`);
  }
  const events = source.events.map((event, index) =>
    parseTutorLiveRunAction(event, `liveRun.events[${index}]`),
  );
  unique(
    events.map((event) => event.id),
    "liveRun.events",
  );
  if (events[0]?.type !== "start") {
    fail("liveRun.events[0]", "must be the start action");
  }
  if (events[0].elapsedSeconds !== 0) {
    fail("liveRun.events[0].elapsedSeconds", "must be zero when a run starts");
  }
  for (let index = 1; index < events.length; index += 1) {
    if (events[index]!.elapsedSeconds < events[index - 1]!.elapsedSeconds) {
      fail(`liveRun.events[${index}]`, "elapsed time must be monotonic");
    }
    if (
      Date.parse(events[index]!.atClient) <
      Date.parse(events[index - 1]!.atClient)
    ) {
      fail(`liveRun.events[${index}]`, "timestamps must be monotonic");
    }
  }
  const elapsedSeconds = integer(
    source.elapsedSeconds,
    "liveRun.elapsedSeconds",
    0,
    MAX_SESSION_SECONDS,
  );
  if (events.at(-1)!.elapsedSeconds !== elapsedSeconds) {
    fail("liveRun.elapsedSeconds", "must match the latest meaningful action");
  }
  const status = enumValue(
    source.status,
    TUTOR_LIVE_RUN_STATUSES,
    "liveRun.status",
  );
  const endedAtClient = nullableTimestamp(
    source.endedAtClient,
    "liveRun.endedAtClient",
  );
  if ((status === "completed" || status === "abandoned") !== Boolean(endedAtClient)) {
    fail("liveRun.endedAtClient", "must exist exactly when the run is terminal");
  }

  let replayedStatus: TutorLiveRunStatus = "running";
  let replayedStageId = events[0].stageId!;
  let replayedCardId = events[0].cardId ?? null;
  for (let index = 1; index < events.length; index += 1) {
    const event = events[index]!;
    replayedStatus = statusAfterAction(replayedStatus, event.type);
    if (event.stageId !== undefined) replayedStageId = event.stageId;
    if (event.cardId !== undefined) replayedCardId = event.cardId;
  }
  if (status !== replayedStatus) {
    fail("liveRun.status", "does not match the saved action history");
  }
  if (source.currentStageId !== replayedStageId) {
    fail("liveRun.currentStageId", "does not match the saved action history");
  }
  if (source.currentCardId !== replayedCardId) {
    fail("liveRun.currentCardId", "does not match the saved action history");
  }
  if (source.startedAtClient !== events[0].atClient) {
    fail("liveRun.startedAtClient", "must match the start action");
  }
  if (source.updatedAtClient !== events.at(-1)!.atClient) {
    fail("liveRun.updatedAtClient", "must match the latest action");
  }
  if (
    endedAtClient !== null &&
    endedAtClient !== events.at(-1)!.atClient
  ) {
    fail("liveRun.endedAtClient", "must match the terminal action");
  }
  if (source.revision !== events.length) {
    fail("liveRun.revision", "must equal the number of saved actions");
  }
  return {
    schemaVersion: TUTOR_LIVE_RUN_SCHEMA_VERSION,
    id: identifier(source.id, "liveRun.id"),
    playbookId: identifier(source.playbookId, "liveRun.playbookId"),
    playbookVersion: identifier(
      source.playbookVersion,
      "liveRun.playbookVersion",
    ),
    sessionNumber: integer(
      source.sessionNumber,
      "liveRun.sessionNumber",
      1,
      MAX_SESSION_NUMBER,
    ),
    routeId: identifier(source.routeId, "liveRun.routeId"),
    status,
    currentStageId: identifier(source.currentStageId, "liveRun.currentStageId"),
    currentCardId:
      source.currentCardId === null
        ? null
        : identifier(source.currentCardId, "liveRun.currentCardId"),
    elapsedSeconds,
    startedAtClient: isoTimestamp(
      source.startedAtClient,
      "liveRun.startedAtClient",
    ),
    endedAtClient,
    events,
    revision: integer(source.revision, "liveRun.revision", 1, 1_000_000),
    updatedBy: requiredString(source.updatedBy, "liveRun.updatedBy", 128),
    updatedAtClient: isoTimestamp(
      source.updatedAtClient,
      "liveRun.updatedAtClient",
    ),
  };
}

function statusAfterAction(
  current: TutorLiveRunStatus,
  action: TutorLiveRunActionType,
): TutorLiveRunStatus {
  if (current === "completed" || current === "abandoned") {
    throw new TutorLiveRunConflictError("A completed or abandoned run is immutable.");
  }
  if (action === "start") {
    throw new TutorLiveRunConflictError("A live run can be started only once.");
  }
  if (action === "pause") {
    if (current !== "running") {
      throw new TutorLiveRunConflictError("Only a running session can be paused.");
    }
    return "paused";
  }
  if (action === "resume") {
    if (current !== "paused") {
      throw new TutorLiveRunConflictError("Only a paused session can be resumed.");
    }
    return "running";
  }
  if (action === "complete") return "completed";
  if (action === "abandon") return "abandoned";
  if (current === "paused" && action !== "note") {
    throw new TutorLiveRunConflictError("Resume the session before recording that action.");
  }
  return current;
}

export function applyTutorLiveRunAction(
  currentValue: TutorLiveRun | null,
  requestValue: TutorLiveRunSaveRequest,
  actorUid: string,
): TutorLiveRun {
  const request = parseTutorLiveRunSaveRequest(requestValue);
  const actor = requiredString(actorUid, "actorUid", 128);
  const action = request.action;

  if (!currentValue) {
    if (request.expectedRevision !== 0) {
      throw new TutorLiveRunConflictError("A new run must expect revision zero.");
    }
    if (action.type !== "start") {
      throw new TutorLiveRunConflictError("The first saved action must be start.");
    }
    return parseTutorLiveRun({
      schemaVersion: TUTOR_LIVE_RUN_SCHEMA_VERSION,
      id: request.runId,
      playbookId: request.playbookId,
      playbookVersion: request.playbookVersion,
      sessionNumber: request.sessionNumber,
      routeId: request.routeId,
      status: "running",
      currentStageId: action.stageId,
      currentCardId: action.cardId ?? null,
      elapsedSeconds: action.elapsedSeconds,
      startedAtClient: action.atClient,
      endedAtClient: null,
      events: [action],
      revision: 1,
      updatedBy: actor,
      updatedAtClient: action.atClient,
    });
  }

  const current = parseTutorLiveRun(currentValue);
  if (request.expectedRevision !== current.revision) {
    throw new TutorLiveRunConflictError(
      `Expected revision ${request.expectedRevision}, but cloud revision is ${current.revision}.`,
    );
  }
  if (
    request.runId !== current.id ||
    request.playbookId !== current.playbookId ||
    request.playbookVersion !== current.playbookVersion ||
    request.sessionNumber !== current.sessionNumber ||
    request.routeId !== current.routeId
  ) {
    throw new TutorLiveRunConflictError("Run identity and route cannot change after start.");
  }
  if (current.events.some((event) => event.id === action.id)) {
    throw new TutorLiveRunConflictError("That action has already been saved.");
  }
  if (current.events.length >= MAX_TUTOR_LIVE_RUN_EVENTS) {
    throw new TutorLiveRunConflictError("The live run event limit has been reached.");
  }
  if (action.elapsedSeconds < current.elapsedSeconds) {
    throw new TutorLiveRunConflictError("Elapsed time cannot move backwards.");
  }
  if (Date.parse(action.atClient) < Date.parse(current.updatedAtClient)) {
    throw new TutorLiveRunConflictError("Action time cannot move backwards.");
  }

  const status = statusAfterAction(current.status, action.type);
  const terminal = status === "completed" || status === "abandoned";
  return parseTutorLiveRun({
    ...current,
    status,
    currentStageId: action.stageId ?? current.currentStageId,
    currentCardId:
      action.cardId === undefined ? current.currentCardId : action.cardId,
    elapsedSeconds: action.elapsedSeconds,
    endedAtClient: terminal ? action.atClient : null,
    events: [...current.events, action],
    revision: current.revision + 1,
    updatedBy: actor,
    updatedAtClient: action.atClient,
  });
}
