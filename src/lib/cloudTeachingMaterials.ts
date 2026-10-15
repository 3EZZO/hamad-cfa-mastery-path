import {
  FirebaseError,
} from "firebase/app";
import {
  Bytes,
  collection,
  doc,
  getDoc,
  getDocFromServer,
  getDocs,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  where,
  type Firestore,
} from "firebase/firestore";
import {
  chunkCountFor,
  chunkIdFor,
  grantManifestFields,
  isVersionId,
  joinChunks,
  MAX_MATERIAL_BYTES,
  MATERIAL_CHUNK_BYTES,
  MAX_TUTOR_NOTE_CHARS,
  splitIntoChunks,
  toHex,
  materialIdFor,
  normalizeMaterialTitle,
  normalizeReadingNumber,
  parseGrant,
  parseMaterial,
  parseMaterialVersion,
  parseReceipt,
  planReceipt,
  planRevoke,
  planShare,
  sanitizeReaderPreference,
  MATERIAL_CONTENT_TYPE,
  MATERIAL_SOURCE_EDITION,
  versionIdFor,
  clampPage,
  clampZoom,
  validatePageCount,
  type MaterialGrant,
  type MaterialReceipt,
  type ReaderPreference,
  type SharePlan,
  type ShareRequest,
  type TeachingMaterial,
  type TeachingMaterialVersion,
} from "../features/teachingMaterials/materialTypes";
import { getCloudFirestore, getCurrentCloudUser } from "./cloud";
import {
  parseTeachingEnvelope,
  type TeachingSessionEnvelope,
} from "../features/liveSession/teachingHost";

/**
 * Firestore side of teaching materials: tutor catalogue and manifests,
 * per-student grants and opened receipts, per-user reader preferences and
 * the tutor's private teaching-session envelope and notes.
 *
 * PDF bytes are stored as immutable binary chunk documents under each
 * version manifest (Spark plan: no Cloud Storage bucket or billing). They are
 * written with the manifest in one transaction and read only through the
 * rules-checked chunk path, never through a public URL.
 *
 * The service is built from injected Firebase handles so the emulator
 * permission suite runs these exact queries and writes. The app instance
 * (`teachingMaterialService()`) uses the existing named Firebase app.
 */

const PROGRAM = ["programs", "project-202"] as const;
const UID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;
const RUN_ID_PATTERN = /^session-\d{2}$/;

export type MaterialErrorCode =
  | "authentication-required"
  | "permission-denied"
  | "not-found"
  | "too-large"
  | "invalid-material"
  | "conflict"
  | "cancelled"
  | "network"
  | "unknown";

const MESSAGES: Record<MaterialErrorCode, string> = {
  "authentication-required": "Sign in again to open teaching materials.",
  "permission-denied": "Access to this material is not available for this account.",
  "not-found": "This material is no longer available.",
  "too-large": "The PDF is larger than the allowed size.",
  "invalid-material": "The material record is invalid.",
  conflict: "This record changed on another device. Reload and try again.",
  cancelled: "The transfer was cancelled.",
  network: "The network is unavailable. Check the connection and try again.",
  unknown: "The material request could not be completed. Please try again.",
};

export class MaterialServiceError extends Error {
  readonly code: MaterialErrorCode;
  constructor(code: MaterialErrorCode, cause?: unknown) {
    super(MESSAGES[code], { cause });
    this.name = "MaterialServiceError";
    this.code = code;
  }
}

export function mapMaterialError(error: unknown): MaterialServiceError {
  if (error instanceof MaterialServiceError) return error;
  const code = error instanceof FirebaseError
    ? error.code
    : typeof error === "object" && error !== null && typeof (error as { code?: unknown }).code === "string"
      ? (error as { code: string }).code : "";
  switch (code) {
    case "permission-denied":
    case "firestore/permission-denied":
      return new MaterialServiceError("permission-denied", error);
    case "not-found":
      return new MaterialServiceError("not-found", error);
    case "cancelled":
      return new MaterialServiceError("cancelled", error);
    case "invalid-argument":
    case "resource-exhausted":
      return new MaterialServiceError("too-large", error);
    case "unavailable":
    case "deadline-exceeded":
    case "auth/network-request-failed":
      return new MaterialServiceError("network", error);
    default:
      return new MaterialServiceError("unknown", error);
  }
}

function requireUid(value: string): string {
  if (!UID_PATTERN.test(value)) throw new MaterialServiceError("invalid-material");
  return value;
}

function requireVersion(value: string): string {
  if (!isVersionId(value)) throw new MaterialServiceError("invalid-material");
  return value;
}

// ------------------------------------------------------------- refs

export const materialRefs = {
  materials: (fs: Firestore) => collection(fs, ...PROGRAM, "teachingMaterials"),
  material: (fs: Firestore, materialId: string) => doc(fs, ...PROGRAM, "teachingMaterials", materialId),
  versions: (fs: Firestore) => collection(fs, ...PROGRAM, "teachingMaterialVersions"),
  version: (fs: Firestore, versionId: string) => doc(fs, ...PROGRAM, "teachingMaterialVersions", requireVersion(versionId)),
  /** Immutable PDF byte chunk `index` of a version with `chunkCount` chunks. */
  chunk: (fs: Firestore, versionId: string, index: number, chunkCount: number) =>
    doc(materialRefs.version(fs, versionId), "chunks", chunkIdFor(index, chunkCount)),
  grants: (fs: Firestore, uid: string) => collection(fs, ...PROGRAM, "materialRecipients", requireUid(uid), "grants"),
  grant: (fs: Firestore, uid: string, versionId: string) =>
    doc(fs, ...PROGRAM, "materialRecipients", requireUid(uid), "grants", requireVersion(versionId)),
  /** The only grant query a student may run: their own active shares. */
  activeGrants: (fs: Firestore, uid: string) => query(materialRefs.grants(fs, uid), where("status", "==", "active")),
  receipts: (fs: Firestore, uid: string) => collection(fs, ...PROGRAM, "materialRecipients", requireUid(uid), "receipts"),
  receipt: (fs: Firestore, uid: string, versionId: string) =>
    doc(fs, ...PROGRAM, "materialRecipients", requireUid(uid), "receipts", requireVersion(versionId)),
  readerState: (fs: Firestore, uid: string, versionId: string) =>
    doc(fs, ...PROGRAM, "materialReaderStates", requireUid(uid), "versions", requireVersion(versionId)),
  teachingRun: (fs: Firestore, uid: string, runId: string) => {
    if (!RUN_ID_PATTERN.test(runId)) throw new MaterialServiceError("invalid-material");
    return doc(fs, ...PROGRAM, "tutorTeachingSessions", requireUid(uid), "runs", runId);
  },
  teachingNote: (fs: Firestore, uid: string, runId: string, versionId: string) =>
    doc(materialRefs.teachingRun(fs, uid, runId), "notes", requireVersion(versionId)),
};

export interface TeachingMaterialBackend {
  firestore: Firestore;
  currentUid: () => string | null;
}

export interface PublishManifestInput {
  sha256: string;
  byteSize: number;
  pageCount: number;
  title: string;
  readingNumber: number | null;
  topic?: string;
}

export interface RecipientShares {
  grants: MaterialGrant[];
  receipts: MaterialReceipt[];
}

export interface TeachingNote {
  text: string;
  revision: number;
}

export function createTeachingMaterialService(backend: TeachingMaterialBackend) {
  const fs = backend.firestore;
  const me = (expectedUid?: string) => {
    const uid = backend.currentUid();
    if (!uid || (expectedUid !== undefined && uid !== expectedUid)) throw new MaterialServiceError("authentication-required");
    return uid;
  };
  async function guard<T>(work: () => Promise<T>): Promise<T> {
    try {
      return await work();
    } catch (error) {
      throw mapMaterialError(error);
    }
  }

  /** Planned manifest for an upload; ids are derived, never accepted. */
  function planManifest(input: PublishManifestInput): TeachingMaterialVersion {
    const title = normalizeMaterialTitle(input.title);
    if (!title) throw new MaterialServiceError("invalid-material");
    if (validatePageCount(input.pageCount)) throw new MaterialServiceError("invalid-material");
    const readingNumber = normalizeReadingNumber(input.readingNumber);
    const materialId = materialIdFor(title, readingNumber);
    const versionId = versionIdFor(materialId, input.sha256);
    if (!Number.isInteger(input.byteSize) || input.byteSize <= 0 || input.byteSize > MAX_MATERIAL_BYTES) {
      throw new MaterialServiceError("too-large");
    }
    return {
      versionId,
      materialId,
      sha256: input.sha256,
      byteSize: input.byteSize,
      chunkCount: chunkCountFor(input.byteSize),
      pageCount: input.pageCount,
      contentType: MATERIAL_CONTENT_TYPE,
      title,
      readingNumber,
      sourceEdition: MATERIAL_SOURCE_EDITION,
      createdBy: "",
      createdAtMs: null,
    };
  }

  return {
    planManifest,

    // ---------------------------------------------------- tutor catalogue
    listMaterials: () => guard(async () => {
      const snapshot = await getDocs(materialRefs.materials(fs));
      return snapshot.docs
        .map(item => parseMaterial(item.id, item.data()))
        .filter((item): item is TeachingMaterial => item !== null);
    }),

    listVersions: () => guard(async () => {
      const snapshot = await getDocs(materialRefs.versions(fs));
      return snapshot.docs
        .map(item => parseMaterialVersion(item.id, item.data()))
        .filter((item): item is TeachingMaterialVersion => item !== null);
    }),

    getVersion: (versionId: string) => guard(async () => {
      const snapshot = await getDoc(materialRefs.version(fs, versionId));
      return snapshot.exists() ? parseMaterialVersion(snapshot.id, snapshot.data()) : null;
    }),

    /** Any ready version with identical bytes, whatever its title. */
    findVersionBySha: (sha256: string) => guard(async () => {
      const snapshot = await getDocs(query(materialRefs.versions(fs), where("sha256", "==", sha256)));
      return snapshot.docs
        .map(item => parseMaterialVersion(item.id, item.data()))
        .find((item): item is TeachingMaterialVersion => item !== null) ?? null;
    }),

    /**
     * Atomic publication: every byte chunk, the immutable ready manifest and
     * the catalogue pointer commit together, so a failed or cancelled upload
     * leaves nothing behind and a retry converges on the same version.
     */
    publishVersion: (planned: TeachingMaterialVersion, bytes: Uint8Array, topic = "Quantitative Methods", signal?: AbortSignal) => guard(async () => {
      const uid = me();
      if (bytes.byteLength !== planned.byteSize) throw new MaterialServiceError("invalid-material");
      const digest = toHex(await crypto.subtle.digest("SHA-256", new Uint8Array(bytes)));
      if (digest !== planned.sha256) throw new MaterialServiceError("invalid-material");
      if (signal?.aborted) throw new MaterialServiceError("cancelled");
      const chunks = splitIntoChunks(bytes);
      if (chunks.length !== planned.chunkCount) throw new MaterialServiceError("invalid-material");
      return runTransaction(fs, async transaction => {
        const versionRef = materialRefs.version(fs, planned.versionId);
        const materialRef = materialRefs.material(fs, planned.materialId);
        const [existingVersion, existingMaterial] = [await transaction.get(versionRef), await transaction.get(materialRef)];
        if (signal?.aborted) throw new MaterialServiceError("cancelled");
        if (existingVersion.exists()) {
          const parsed = parseMaterialVersion(existingVersion.id, existingVersion.data());
          if (!parsed) throw new MaterialServiceError("invalid-material");
          return { version: parsed, duplicate: true };
        }
        chunks.forEach((chunk, index) => {
          transaction.set(materialRefs.chunk(fs, planned.versionId, index, planned.chunkCount), {
            versionId: planned.versionId,
            index,
            bytes: Bytes.fromUint8Array(chunk),
          });
        });
        const manifest = { ...planned, createdBy: uid };
        delete (manifest as { createdAtMs?: unknown }).createdAtMs;
        transaction.set(versionRef, { ...manifest, createdAt: serverTimestamp() });
        if (existingMaterial.exists()) {
          transaction.update(materialRef, {
            currentVersionId: planned.versionId,
            title: planned.title,
            readingNumber: planned.readingNumber,
            updatedAt: serverTimestamp(),
          });
        } else {
          transaction.set(materialRef, {
            materialId: planned.materialId,
            title: planned.title,
            topic,
            readingNumber: planned.readingNumber,
            sourceEdition: MATERIAL_SOURCE_EDITION,
            currentVersionId: planned.versionId,
            moduleLinks: [],
            createdBy: uid,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        }
        return { version: { ...planned, createdBy: uid }, duplicate: false };
      });
    }),

    /**
     * Authorized byte download (tutor, or a student with an active grant for
     * exactly this version), checked against the immutable size and hash
     * before anything renders it.
     */
    downloadVersionBytes: (
      version: Pick<TeachingMaterialVersion, "versionId" | "byteSize" | "sha256" | "chunkCount">,
      signal?: AbortSignal,
    ) => guard(async () => {
      if (!isVersionId(version.versionId) || !Number.isInteger(version.byteSize)
        || version.byteSize <= 0 || version.byteSize > MAX_MATERIAL_BYTES
        || version.chunkCount !== chunkCountFor(version.byteSize)) throw new MaterialServiceError("invalid-material");
      if (signal?.aborted) throw new MaterialServiceError("cancelled");
      const snapshots = await Promise.all(Array.from({ length: version.chunkCount }, (_, index) =>
        getDocFromServer(materialRefs.chunk(fs, version.versionId, index, version.chunkCount))));
      if (signal?.aborted) throw new MaterialServiceError("cancelled");
      const parts = snapshots.map((snapshot, index) => {
        const data = snapshot.exists() ? snapshot.data() : null;
        if (!data || data.index !== index || data.versionId !== version.versionId || !(data.bytes instanceof Bytes)) {
          throw new MaterialServiceError("not-found");
        }
        const part = data.bytes.toUint8Array();
        const expected = Math.min(MATERIAL_CHUNK_BYTES, version.byteSize - index * MATERIAL_CHUNK_BYTES);
        if (part.byteLength !== expected) throw new MaterialServiceError("invalid-material");
        return part;
      });
      const bytes = joinChunks(parts);
      if (bytes.byteLength !== version.byteSize) throw new MaterialServiceError("invalid-material");
      const digest = toHex(await crypto.subtle.digest("SHA-256", bytes));
      if (digest !== version.sha256) throw new MaterialServiceError("invalid-material");
      if (signal?.aborted) throw new MaterialServiceError("cancelled");
      return bytes;
    }),

    // ------------------------------------------------------ tutor sharing
    subscribeRecipientShares: (
      recipientUid: string,
      onChange: (shares: RecipientShares) => void,
      onError: (error: MaterialServiceError) => void,
    ) => {
      const state: RecipientShares = { grants: [], receipts: [] };
      let grantsReady = false;
      let receiptsReady = false;
      const emit = () => { if (grantsReady && receiptsReady) onChange({ grants: [...state.grants], receipts: [...state.receipts] }); };
      const stopGrants = onSnapshot(materialRefs.grants(fs, recipientUid), snapshot => {
        state.grants = snapshot.docs
          .map(item => parseGrant(item.id, recipientUid, item.data()))
          .filter((item): item is MaterialGrant => item !== null);
        grantsReady = true;
        emit();
      }, error => onError(mapMaterialError(error)));
      const stopReceipts = onSnapshot(materialRefs.receipts(fs, recipientUid), snapshot => {
        state.receipts = snapshot.docs
          .map(item => parseReceipt(item.id, item.data()))
          .filter((item): item is MaterialReceipt => item !== null);
        receiptsReady = true;
        emit();
      }, error => onError(mapMaterialError(error)));
      return () => { stopGrants(); stopReceipts(); };
    },

    /**
     * Send (or re-send) one exact version to one active student. Runs as a
     * transaction, so a retry after a network failure converges on the same
     * grant: an active duplicate is a no-op and never resets "Opened".
     */
    shareVersion: (version: TeachingMaterialVersion, recipientUid: string, request: ShareRequest) => guard(async () => {
      const uid = me();
      return runTransaction(fs, async transaction => {
        const reference = materialRefs.grant(fs, recipientUid, version.versionId);
        const snapshot = await transaction.get(reference);
        const existing = snapshot.exists() ? parseGrant(snapshot.id, recipientUid, snapshot.data()) : null;
        if (snapshot.exists() && !existing) throw new MaterialServiceError("invalid-material");
        const plan: SharePlan = planShare(existing, request);
        if (plan.kind === "create" || plan.kind === "reactivate") {
          transaction.set(reference, {
            ...grantManifestFields(version),
            recipientUid,
            status: "active",
            shareRevision: plan.shareRevision,
            sessionNumbers: plan.sessionNumbers,
            message: plan.message,
            sharedBy: uid,
            sharedAt: serverTimestamp(),
            revokedAt: null,
          });
        } else if (plan.kind === "update-metadata") {
          transaction.update(reference, { sessionNumbers: plan.sessionNumbers, message: plan.message });
        }
        return plan.kind;
      });
    }),

    revokeVersion: (versionId: string, recipientUid: string) => guard(async () =>
      runTransaction(fs, async transaction => {
        const reference = materialRefs.grant(fs, recipientUid, versionId);
        const snapshot = await transaction.get(reference);
        const existing = snapshot.exists() ? parseGrant(snapshot.id, recipientUid, snapshot.data()) : null;
        const plan = planRevoke(existing);
        if (plan.kind === "revoke") transaction.update(reference, { status: "revoked", revokedAt: serverTimestamp() });
        return plan.kind;
      })),

    // ------------------------------------------------------ student side
    /** Active shares for the signed-in student (removals arrive as changes). */
    subscribeMyActiveGrants: (
      onGrants: (grants: MaterialGrant[]) => void,
      onError: (error: MaterialServiceError) => void,
    ) => {
      const uid = me();
      return onSnapshot(materialRefs.activeGrants(fs, uid), snapshot => {
        onGrants(snapshot.docs
          .map(item => parseGrant(item.id, uid, item.data()))
          .filter((item): item is MaterialGrant => item !== null && item.status === "active"));
      }, error => onError(mapMaterialError(error)));
    },

    /** Watches one grant; a revoked or denied grant reports null. */
    watchMyGrant: (
      versionId: string,
      onGrant: (grant: MaterialGrant | null) => void,
    ) => {
      const uid = me();
      return onSnapshot(materialRefs.grant(fs, uid, versionId), snapshot => {
        const grant = snapshot.exists() ? parseGrant(snapshot.id, uid, snapshot.data()) : null;
        onGrant(grant && grant.status === "active" ? grant : null);
      }, () => onGrant(null));
    },

    /**
     * Opened receipt after an authorized page render. The current grant
     * revision is read in the same transaction, so a stale tab cannot mark a
     * newer share as opened.
     */
    recordOpened: (versionId: string, renderedRevision: number) => guard(async () => {
      const uid = me();
      return runTransaction(fs, async transaction => {
        const grantSnapshot = await transaction.get(materialRefs.grant(fs, uid, versionId));
        const grant = grantSnapshot.exists() ? parseGrant(grantSnapshot.id, uid, grantSnapshot.data()) : null;
        if (!grant || grant.status !== "active") throw new MaterialServiceError("permission-denied");
        if (grant.shareRevision !== renderedRevision) return "stale" as const;
        const receiptRef = materialRefs.receipt(fs, uid, versionId);
        const receiptSnapshot = await transaction.get(receiptRef);
        const existing = receiptSnapshot.exists() ? parseReceipt(receiptSnapshot.id, receiptSnapshot.data()) : null;
        const plan = planReceipt(existing, grant.shareRevision);
        if (plan.kind === "stale") return plan.kind;
        if (plan.kind === "touch") {
          transaction.update(receiptRef, { lastOpenedAt: serverTimestamp() });
        } else {
          transaction.set(receiptRef, {
            versionId,
            shareRevision: grant.shareRevision,
            firstOpenedAt: serverTimestamp(),
            lastOpenedAt: serverTimestamp(),
          });
        }
        return plan.kind;
      });
    }),

    // --------------------------------------------- per-user reader state
    loadReaderPreference: (versionId: string, pageCount: number) => guard(async () => {
      const snapshot = await getDoc(materialRefs.readerState(fs, me(), versionId));
      return snapshot.exists() ? sanitizeReaderPreference(snapshot.data(), versionId, pageCount) : null;
    }),

    saveReaderPreference: (preference: ReaderPreference, pageCount: number) => guard(async () => {
      await setDoc(materialRefs.readerState(fs, me(), preference.versionId), {
        versionId: preference.versionId,
        page: clampPage(preference.page, pageCount),
        zoom: clampZoom(preference.zoom),
        fitMode: preference.fitMode,
        updatedAt: serverTimestamp(),
      });
    }),

    // ------------------------------------- tutor teaching session (private)
    loadTeachingEnvelope: (runId: string) => guard(async () => {
      const uid = me();
      const snapshot = await getDoc(materialRefs.teachingRun(fs, uid, runId));
      return snapshot.exists() ? parseTeachingEnvelope(uid, runId, snapshot.data()) : null;
    }),

    /**
     * Compare-and-set save. A save prepared against an older revision is
     * rejected (`conflict`) rather than overwriting a newer device's record.
     */
    saveTeachingEnvelope: (
      next: Omit<TeachingSessionEnvelope, "revision" | "ownerUid" | "updatedAtClient">,
      expectedRevision: number,
      expectedOwnerUid?: string,
    ) => guard(async () => {
      const uid = me(expectedOwnerUid);
      const reference = materialRefs.teachingRun(fs, uid, next.runId);
      return runTransaction(fs, async transaction => {
        me(uid);
        const snapshot = await transaction.get(reference);
        const current = snapshot.exists() ? parseTeachingEnvelope(uid, next.runId, snapshot.data()) : null;
        if (snapshot.exists() && !current) throw new MaterialServiceError("invalid-material");
        if ((current?.revision ?? 0) !== expectedRevision) throw new MaterialServiceError("conflict");
        const envelope: TeachingSessionEnvelope = {
          ...next,
          ownerUid: uid,
          rehearsal: false,
          revision: expectedRevision + 1,
          updatedAtClient: new Date().toISOString(),
        };
        transaction.set(reference, envelope);
        return envelope;
      });
    }),

    loadTeachingNote: (runId: string, versionId: string) => guard(async () => {
      const snapshot = await getDoc(materialRefs.teachingNote(fs, me(), runId, versionId));
      if (!snapshot.exists()) return null;
      const data = snapshot.data();
      return {
        text: typeof data.text === "string" ? data.text.slice(0, MAX_TUTOR_NOTE_CHARS) : "",
        revision: Number.isSafeInteger(data.revision) ? Number(data.revision) : 0,
      } satisfies TeachingNote;
    }),

    saveTeachingNote: (runId: string, versionId: string, text: string, expectedRevision: number, expectedOwnerUid?: string) => guard(async () => {
      const uid = me(expectedOwnerUid);
      const reference = materialRefs.teachingNote(fs, uid, runId, versionId);
      return runTransaction(fs, async transaction => {
        me(uid);
        const snapshot = await transaction.get(reference);
        const current = snapshot.exists() ? Number(snapshot.data().revision) : 0;
        if (current !== expectedRevision) throw new MaterialServiceError("conflict");
        const revision = expectedRevision + 1;
        transaction.set(reference, {
          versionId,
          text: text.slice(0, MAX_TUTOR_NOTE_CHARS),
          revision,
          updatedAt: serverTimestamp(),
        });
        return revision;
      });
    }),
  };
}

export type TeachingMaterialService = ReturnType<typeof createTeachingMaterialService>;

export interface PublishResult {
  version: TeachingMaterialVersion;
  duplicate: boolean;
}

/**
 * Upload sequence: identical bytes resolve to the existing ready version
 * (whatever its title); otherwise chunks, manifest and catalogue pointer are
 * published atomically. No grant is created or changed.
 */
export async function publishMaterialVersion(
  service: TeachingMaterialService,
  input: PublishManifestInput & { bytes: Uint8Array },
  options: { signal?: AbortSignal } = {},
): Promise<PublishResult> {
  if (options.signal?.aborted) throw new MaterialServiceError("cancelled");
  if (input.bytes.byteLength !== input.byteSize || input.byteSize > MAX_MATERIAL_BYTES) {
    throw new MaterialServiceError("too-large");
  }
  const planned = service.planManifest(input);
  const sameBytes = await service.findVersionBySha(input.sha256);
  if (sameBytes) return { version: sameBytes, duplicate: true };
  if (options.signal?.aborted) throw new MaterialServiceError("cancelled");
  return service.publishVersion(planned, input.bytes, input.topic, options.signal);
}

let appService: TeachingMaterialService | null = null;

/** Service bound to the project's named Firebase app (browser only). */
export function teachingMaterialService(): TeachingMaterialService {
  if (appService) return appService;
  appService = createTeachingMaterialService({
    firestore: getCloudFirestore(),
    currentUid: () => getCurrentCloudUser()?.uid ?? null,
  });
  return appService;
}
