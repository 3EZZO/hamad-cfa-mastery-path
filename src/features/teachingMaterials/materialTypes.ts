/**
 * Teaching materials: schemas, identifiers and the pure sharing/receipt
 * transitions shared by the tutor library, the student reader and the
 * emulator permission tests. Nothing here touches Firebase.
 *
 * A material is the tutor's catalogue entry (one per reading/title). Each
 * upload is an immutable version identified by its content hash; students
 * receive a per-version grant, never the catalogue. The PDF bytes live in
 * immutable Firestore chunk documents under the version (free Spark plan; no
 * Cloud Storage bucket), readable only by the tutor or a student holding an
 * active grant for that exact version. See docs/pdf-teaching-rollout.md.
 */

export const TEACHING_PROGRAM_ROOT = "programs/project-202";
export const MATERIAL_CONTENT_TYPE = "application/pdf";
export const MATERIAL_SOURCE_EDITION = 2026;
/** One chunk stays well below Firestore's 1 MiB document limit. */
export const MATERIAL_CHUNK_BYTES = 900 * 1024;
export const MAX_MATERIAL_CHUNKS = 6;
/** Bounded so one publish transaction stays under Firestore's request limit. */
export const MAX_MATERIAL_BYTES = 5 * 1024 * 1024;
export const MAX_MATERIAL_PAGES = 100;
export const MAX_MATERIAL_TITLE = 160;
export const MAX_GRANT_MESSAGE = 500;
export const MAX_GRANT_SESSIONS = 25;
export const MAX_TUTOR_NOTE_CHARS = 20_000;
export const MIN_READER_ZOOM = 0.5;
export const MAX_READER_ZOOM = 3;

export const MATERIAL_ID_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,58}[a-z0-9])?$/;
export const SHA256_PATTERN = /^[0-9a-f]{64}$/;
export const VERSION_ID_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,58}[a-z0-9])?-[0-9a-f]{64}$/;

export type GrantStatus = "active" | "revoked";
export type FitMode = "width" | "page" | "custom";

export interface TeachingMaterial {
  materialId: string;
  title: string;
  topic: string;
  readingNumber: number | null;
  sourceEdition: number;
  currentVersionId: string;
  moduleLinks: string[];
  createdBy: string;
  createdAtMs: number | null;
  updatedAtMs: number | null;
}

export interface TeachingMaterialVersion {
  versionId: string;
  materialId: string;
  sha256: string;
  byteSize: number;
  chunkCount: number;
  pageCount: number;
  contentType: typeof MATERIAL_CONTENT_TYPE;
  title: string;
  readingNumber: number | null;
  sourceEdition: number;
  createdBy: string;
  createdAtMs: number | null;
}

/** Student-safe copy of the version manifest plus the share lifecycle. */
export interface MaterialGrant {
  versionId: string;
  materialId: string;
  recipientUid: string;
  status: GrantStatus;
  shareRevision: number;
  sessionNumbers: number[];
  message: string;
  title: string;
  readingNumber: number | null;
  sourceEdition: number;
  pageCount: number;
  byteSize: number;
  chunkCount: number;
  sha256: string;
  sharedBy: string;
  sharedAtMs: number | null;
  revokedAtMs: number | null;
}

export interface MaterialReceipt {
  versionId: string;
  shareRevision: number;
  firstOpenedAtMs: number | null;
  lastOpenedAtMs: number | null;
}

export interface ReaderPreference {
  versionId: string;
  page: number;
  zoom: number;
  fitMode: FitMode;
}

export class MaterialValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MaterialValidationError";
  }
}

// ------------------------------------------------------------------ ids

function slugWords(value: string): string[] {
  return value.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
}

/** Stable catalogue id: `r01-rates-and-returns`, or `m-<slug>` without a reading. */
export function materialIdFor(title: string, readingNumber: number | null): string {
  const prefix = readingNumber === null ? "m" : `r${String(readingNumber).padStart(2, "0")}`;
  let slug = slugWords(title).join("-");
  const room = 60 - prefix.length - 1;
  if (slug.length > room) slug = slug.slice(0, room).replace(/-+$/, "");
  const id = slug ? `${prefix}-${slug}` : prefix === "m" ? "m-material" : prefix;
  if (!MATERIAL_ID_PATTERN.test(id)) throw new MaterialValidationError("The material title cannot form a safe identifier.");
  return id;
}

export function versionIdFor(materialId: string, sha256: string): string {
  if (!MATERIAL_ID_PATTERN.test(materialId)) throw new MaterialValidationError("Invalid material identifier.");
  if (!SHA256_PATTERN.test(sha256)) throw new MaterialValidationError("Invalid SHA-256 digest.");
  return `${materialId}-${sha256}`;
}

export function isVersionId(value: unknown): value is string {
  return typeof value === "string" && VERSION_ID_PATTERN.test(value);
}

export function parseVersionId(versionId: string): { materialId: string; sha256: string } | null {
  if (!isVersionId(versionId)) return null;
  return { materialId: versionId.slice(0, -65), sha256: versionId.slice(-64) };
}

/** Number of immutable chunk documents for a file of `byteSize` bytes. */
export function chunkCountFor(byteSize: number): number {
  if (!Number.isInteger(byteSize) || byteSize <= 0 || byteSize > MAX_MATERIAL_BYTES) {
    throw new MaterialValidationError("Invalid material byte size.");
  }
  return Math.ceil(byteSize / MATERIAL_CHUNK_BYTES);
}

/** Chunk ids are "0", "1", …; built from the index, never accepted from input. */
export function chunkIdFor(index: number, chunkCount: number): string {
  if (!Number.isInteger(chunkCount) || chunkCount < 1 || chunkCount > MAX_MATERIAL_CHUNKS
    || !Number.isInteger(index) || index < 0 || index >= chunkCount) {
    throw new MaterialValidationError("Invalid material chunk.");
  }
  return String(index);
}

export function splitIntoChunks(bytes: Uint8Array): Uint8Array[] {
  const count = chunkCountFor(bytes.byteLength);
  return Array.from({ length: count }, (_, index) =>
    bytes.subarray(index * MATERIAL_CHUNK_BYTES, Math.min(bytes.byteLength, (index + 1) * MATERIAL_CHUNK_BYTES)));
}

export function joinChunks(chunks: readonly Uint8Array[]): Uint8Array<ArrayBuffer> {
  const total = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

const SMALL_WORDS = new Set(["a", "an", "and", "as", "at", "by", "for", "in", "of", "on", "or", "the", "to"]);

/** Labels proposed from a file name; the tutor confirms them before upload. */
export function proposeMaterialLabel(fileName: string): { readingNumber: number | null; title: string } {
  const base = fileName.replace(/\.pdf$/i, "");
  const match = /(?:^|[-_ ])reading[-_ ]?(\d{1,2})[-_ ](.+)$/i.exec(base);
  const words = slugWords(match ? match[2] : base);
  const joined: string[] = [];
  for (let index = 0; index < words.length; index += 1) {
    if (words[index] === "non" && words[index + 1]) {
      joined.push(`non-${words[index + 1]}`);
      index += 1;
    } else joined.push(words[index]);
  }
  const title = joined
    .map((word, index) =>
      index > 0 && SMALL_WORDS.has(word)
        ? word
        : word.split("-").map(part => part.charAt(0).toUpperCase() + part.slice(1)).join("-"),
    )
    .join(" ");
  const reading = match ? Number(match[1]) : null;
  return { readingNumber: reading !== null && reading >= 1 && reading <= 99 ? reading : null, title: title || "Untitled material" };
}

export function normalizeMaterialTitle(value: string): string {
  return value.replace(/\s+/g, " ").trim().slice(0, MAX_MATERIAL_TITLE);
}

export function normalizeReadingNumber(value: unknown): number | null {
  const number = typeof value === "string" && value.trim() ? Number(value) : value;
  return typeof number === "number" && Number.isInteger(number) && number >= 1 && number <= 99 ? number : null;
}

// ------------------------------------------------------- file validation

const PDF_SIGNATURE = [0x25, 0x50, 0x44, 0x46, 0x2d]; // %PDF-

export function hasPdfSignature(head: Uint8Array): boolean {
  const limit = Math.min(head.length, 1024) - PDF_SIGNATURE.length;
  for (let offset = 0; offset <= limit; offset += 1) {
    if (PDF_SIGNATURE.every((byte, index) => head[offset + index] === byte)) return true;
  }
  return false;
}

/** Cheap checks before parsing; returns a tutor-facing problem or null. */
export function validatePdfFileShape(
  file: { name: string; type: string; size: number },
  head: Uint8Array,
): string | null {
  if (!/\.pdf$/i.test(file.name)) return "Only .pdf files can be added.";
  if (file.type && file.type !== MATERIAL_CONTENT_TYPE) return "The browser did not report this file as a PDF.";
  if (file.size <= 0) return "The file is empty.";
  if (file.size > MAX_MATERIAL_BYTES) return "The file is larger than the 5 MiB limit.";
  if (!hasPdfSignature(head)) return "The file does not start with a PDF signature.";
  return null;
}

export function validatePageCount(pageCount: number): string | null {
  if (!Number.isInteger(pageCount) || pageCount < 1) return "The PDF has no readable pages.";
  if (pageCount > MAX_MATERIAL_PAGES) return "The PDF has more than 100 pages.";
  return null;
}

export function toHex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)].map(byte => byte.toString(16).padStart(2, "0")).join("");
}

// ------------------------------------------------------ share lifecycle

export function normalizeSessionNumbers(values: readonly unknown[]): number[] {
  const unique = new Set<number>();
  for (const value of values) {
    if (typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 25) unique.add(value);
  }
  return [...unique].sort((a, b) => a - b).slice(0, MAX_GRANT_SESSIONS);
}

export function normalizeGrantMessage(value: unknown): string {
  return typeof value === "string" ? value.replace(/\r\n/g, "\n").trim().slice(0, MAX_GRANT_MESSAGE) : "";
}

export interface ShareRequest {
  sessionNumber: number | null;
  message: string;
}

export type SharePlan =
  | { kind: "create"; shareRevision: 1; sessionNumbers: number[]; message: string }
  | { kind: "reactivate"; shareRevision: number; sessionNumbers: number[]; message: string }
  | { kind: "update-metadata"; sessionNumbers: number[]; message: string }
  | { kind: "noop" };

/**
 * Send-to-student decision. A repeated send of an active grant never resets
 * its revision (so an existing Opened receipt stays valid); it only adds the
 * new session association or message. Re-sharing a revoked grant starts a
 * new revision so an old receipt cannot count as a new opening.
 */
export function planShare(existing: Pick<MaterialGrant, "status" | "shareRevision" | "sessionNumbers" | "message"> | null, request: ShareRequest): SharePlan {
  const message = normalizeGrantMessage(request.message);
  const requested = normalizeSessionNumbers(request.sessionNumber === null ? [] : [request.sessionNumber]);
  if (!existing) return { kind: "create", shareRevision: 1, sessionNumbers: requested, message };
  if (existing.status === "revoked") {
    return { kind: "reactivate", shareRevision: existing.shareRevision + 1, sessionNumbers: requested, message };
  }
  const sessionNumbers = normalizeSessionNumbers([...existing.sessionNumbers, ...requested]);
  const nextMessage = message || existing.message;
  const sameSessions = sessionNumbers.length === existing.sessionNumbers.length
    && sessionNumbers.every((value, index) => value === existing.sessionNumbers[index]);
  if (sameSessions && nextMessage === existing.message) return { kind: "noop" };
  return { kind: "update-metadata", sessionNumbers, message: nextMessage };
}

export function planRevoke(existing: Pick<MaterialGrant, "status"> | null): { kind: "revoke" } | { kind: "noop" } {
  return existing?.status === "active" ? { kind: "revoke" } : { kind: "noop" };
}

export type ReceiptPlan =
  | { kind: "create" }
  | { kind: "touch" }
  | { kind: "new-revision" }
  | { kind: "stale" };

/** How an authorized first render updates the opened receipt. */
export function planReceipt(existing: Pick<MaterialReceipt, "shareRevision"> | null, grantRevision: number): ReceiptPlan {
  if (!existing) return { kind: "create" };
  if (existing.shareRevision === grantRevision) return { kind: "touch" };
  if (existing.shareRevision < grantRevision) return { kind: "new-revision" };
  return { kind: "stale" };
}

/** "Opened" counts only for the grant's current share revision. */
export function receiptCountsAsOpened(
  receipt: Pick<MaterialReceipt, "shareRevision" | "firstOpenedAtMs"> | null | undefined,
  grant: Pick<MaterialGrant, "status" | "shareRevision"> | null | undefined,
): boolean {
  return Boolean(
    receipt && grant && grant.status === "active"
      && receipt.shareRevision === grant.shareRevision
      && receipt.firstOpenedAtMs !== null,
  );
}

// -------------------------------------------------------- reader state

export function clampPage(page: unknown, pageCount: number): number {
  const total = Math.max(1, Math.floor(pageCount));
  const value = typeof page === "number" && Number.isFinite(page) ? Math.round(page) : 1;
  return Math.min(total, Math.max(1, value));
}

export function clampZoom(zoom: unknown): number {
  const value = typeof zoom === "number" && Number.isFinite(zoom) ? zoom : 1;
  return Math.round(Math.min(MAX_READER_ZOOM, Math.max(MIN_READER_ZOOM, value)) * 100) / 100;
}

export function isFitMode(value: unknown): value is FitMode {
  return value === "width" || value === "page" || value === "custom";
}

export function sanitizeReaderPreference(value: unknown, versionId: string, pageCount = MAX_MATERIAL_PAGES): ReaderPreference | null {
  if (typeof value !== "object" || value === null) return null;
  const record = value as Record<string, unknown>;
  if (record.versionId !== versionId) return null;
  return {
    versionId,
    page: clampPage(record.page, pageCount),
    zoom: clampZoom(record.zoom),
    fitMode: isFitMode(record.fitMode) ? record.fitMode : "width",
  };
}

// ------------------------------------------------------------- parsing

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown, max: number): string {
  return typeof value === "string" ? value.slice(0, max) : "";
}

function positiveInt(value: unknown, max: number): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= max ? value : null;
}

/** Firestore Timestamp (or anything with toMillis) → epoch ms. */
export function timestampMs(value: unknown): number | null {
  if (isRecord(value) && typeof (value as { toMillis?: unknown }).toMillis === "function") {
    const ms = (value as { toMillis: () => number }).toMillis();
    return Number.isFinite(ms) ? ms : null;
  }
  return null;
}

export function parseMaterialVersion(id: string, value: unknown): TeachingMaterialVersion | null {
  if (!isRecord(value) || value.versionId !== id || !isVersionId(id)) return null;
  const parsed = parseVersionId(id)!;
  const byteSize = positiveInt(value.byteSize, MAX_MATERIAL_BYTES);
  const pageCount = positiveInt(value.pageCount, MAX_MATERIAL_PAGES);
  if (
    value.materialId !== parsed.materialId || value.sha256 !== parsed.sha256
    || byteSize === null || pageCount === null || value.chunkCount !== chunkCountFor(byteSize)
    || value.contentType !== MATERIAL_CONTENT_TYPE
  ) return null;
  return {
    versionId: id,
    materialId: parsed.materialId,
    sha256: parsed.sha256,
    byteSize,
    chunkCount: chunkCountFor(byteSize),
    pageCount,
    contentType: MATERIAL_CONTENT_TYPE,
    title: text(value.title, MAX_MATERIAL_TITLE) || "Untitled material",
    readingNumber: normalizeReadingNumber(value.readingNumber),
    sourceEdition: typeof value.sourceEdition === "number" ? value.sourceEdition : MATERIAL_SOURCE_EDITION,
    createdBy: text(value.createdBy, 128),
    createdAtMs: timestampMs(value.createdAt),
  };
}

export function parseMaterial(id: string, value: unknown): TeachingMaterial | null {
  if (!isRecord(value) || value.materialId !== id || !MATERIAL_ID_PATTERN.test(id) || !isVersionId(value.currentVersionId)) return null;
  return {
    materialId: id,
    title: text(value.title, MAX_MATERIAL_TITLE) || "Untitled material",
    topic: text(value.topic, 80),
    readingNumber: normalizeReadingNumber(value.readingNumber),
    sourceEdition: typeof value.sourceEdition === "number" ? value.sourceEdition : MATERIAL_SOURCE_EDITION,
    currentVersionId: value.currentVersionId,
    moduleLinks: Array.isArray(value.moduleLinks) ? value.moduleLinks.filter((item): item is string => typeof item === "string").slice(0, 20) : [],
    createdBy: text(value.createdBy, 128),
    createdAtMs: timestampMs(value.createdAt),
    updatedAtMs: timestampMs(value.updatedAt),
  };
}

export function parseGrant(id: string, recipientUid: string, value: unknown): MaterialGrant | null {
  if (!isRecord(value) || value.versionId !== id || !isVersionId(id) || value.recipientUid !== recipientUid) return null;
  const identity = parseVersionId(id)!;
  if (value.materialId !== identity.materialId || value.sha256 !== identity.sha256) return null;
  if (value.status !== "active" && value.status !== "revoked") return null;
  const shareRevision = positiveInt(value.shareRevision, 1_000_000);
  const pageCount = positiveInt(value.pageCount, MAX_MATERIAL_PAGES);
  const byteSize = positiveInt(value.byteSize, MAX_MATERIAL_BYTES);
  if (shareRevision === null || pageCount === null || byteSize === null || value.chunkCount !== chunkCountFor(byteSize)) return null;
  return {
    versionId: id,
    materialId: parseVersionId(id)!.materialId,
    recipientUid,
    status: value.status,
    shareRevision,
    sessionNumbers: normalizeSessionNumbers(Array.isArray(value.sessionNumbers) ? value.sessionNumbers : []),
    message: normalizeGrantMessage(value.message),
    title: text(value.title, MAX_MATERIAL_TITLE) || "Untitled material",
    readingNumber: normalizeReadingNumber(value.readingNumber),
    sourceEdition: typeof value.sourceEdition === "number" ? value.sourceEdition : MATERIAL_SOURCE_EDITION,
    pageCount,
    byteSize,
    chunkCount: chunkCountFor(byteSize),
    sha256: parseVersionId(id)!.sha256,
    sharedBy: text(value.sharedBy, 128),
    sharedAtMs: timestampMs(value.sharedAt),
    revokedAtMs: timestampMs(value.revokedAt),
  };
}

export function parseReceipt(id: string, value: unknown): MaterialReceipt | null {
  if (!isRecord(value) || value.versionId !== id || !isVersionId(id)) return null;
  const shareRevision = positiveInt(value.shareRevision, 1_000_000);
  if (shareRevision === null) return null;
  return {
    versionId: id,
    shareRevision,
    firstOpenedAtMs: timestampMs(value.firstOpenedAt),
    lastOpenedAtMs: timestampMs(value.lastOpenedAt),
  };
}

/** Fields a grant copies from its manifest; rules require them to agree. */
export function grantManifestFields(version: TeachingMaterialVersion) {
  return {
    versionId: version.versionId,
    materialId: version.materialId,
    title: version.title,
    readingNumber: version.readingNumber,
    sourceEdition: version.sourceEdition,
    pageCount: version.pageCount,
    byteSize: version.byteSize,
    sha256: version.sha256,
    chunkCount: version.chunkCount,
  };
}

export function materialLabel(item: { readingNumber: number | null; title: string }): string {
  return item.readingNumber === null ? item.title : `Reading ${String(item.readingNumber).padStart(2, "0")} · ${item.title}`;
}

export function formatSharedDate(ms: number | null): string {
  if (ms === null) return "Shared recently";
  return `Shared ${new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" }).format(new Date(ms))}`;
}

/** Newest share first; a share whose server time is pending sorts first. */
export function sortShares<T extends MaterialGrant>(grants: readonly T[]): T[] {
  return [...grants].sort((a, b) => (b.sharedAtMs ?? Number.MAX_SAFE_INTEGER) - (a.sharedAtMs ?? Number.MAX_SAFE_INTEGER));
}
