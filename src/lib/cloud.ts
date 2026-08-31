import {
  FirebaseError,
  getApps,
  initializeApp,
  type FirebaseOptions,
} from "firebase/app";
import {
  GoogleAuthProvider,
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  type Auth,
  type User,
} from "firebase/auth";
import {
  deleteDoc,
  doc,
  getDoc,
  getDocFromServer,
  getFirestore,
  onSnapshot,
  runTransaction,
  writeBatch,
  type Firestore,
} from "firebase/firestore";
import type { PrivateTutorNote, TrackerState } from "../types";
import { mergeTrackerStates } from "./stateMerge";
import { normalizePrivateTutorNotes, normalizeState } from "./storage";
import type { ProjectRole } from "./permissions";
import {
  applyTutorLiveRunAction,
  buildTutorPlaybookChunkStorageId,
  parseTutorLiveRun,
  parseTutorLiveRunSaveRequest,
  parseTutorContentId,
  parseTutorPlaybookChunk,
  parseTutorPlaybookManifest,
  TutorContentValidationError,
  TutorLiveRunConflictError,
  tutorPlaybookPackageToDraft,
  validateTutorPlaybookPackage,
  verifyTutorPlaybookPackageIntegrity,
  type TutorLiveRun,
  type TutorLiveRunSaveRequest,
  type TutorPlaybookChunk,
  type TutorPlaybookManifest,
  type TutorPlaybookPackage,
} from "./tutorContent";

const FIREBASE_APP_NAME = "project-202-cloud";
const PROGRAM_ID = "project-202";

export const CLOUD_TRACKER_DOCUMENT_PATH =
  "programs/project-202/tracker/current" as const;
export const PRIVATE_TUTOR_NOTES_DOCUMENT_PATH =
  "programs/project-202/tutorPrivate/notes" as const;
export const TUTOR_PLAYBOOK_COLLECTION_PATH =
  "programs/project-202/tutorPlaybooks" as const;
export const TUTOR_LIVE_RUN_COLLECTION_PATH =
  "programs/project-202/tutorRuns" as const;

export const REQUIRED_FIREBASE_ENV_KEYS = [
  "VITE_FIREBASE_API_KEY",
  "VITE_FIREBASE_AUTH_DOMAIN",
  "VITE_FIREBASE_PROJECT_ID",
  "VITE_FIREBASE_APP_ID",
] as const;

export const OPTIONAL_FIREBASE_ENV_KEYS = [
  "VITE_FIREBASE_STORAGE_BUCKET",
  "VITE_FIREBASE_MESSAGING_SENDER_ID",
  "VITE_FIREBASE_MEASUREMENT_ID",
] as const;

export type FirebaseEnvironmentKey =
  | (typeof REQUIRED_FIREBASE_ENV_KEYS)[number]
  | (typeof OPTIONAL_FIREBASE_ENV_KEYS)[number];

export interface CloudConfigurationStatus {
  configured: boolean;
  missingKeys: Array<(typeof REQUIRED_FIREBASE_ENV_KEYS)[number]>;
  missingOptionalKeys: Array<(typeof OPTIONAL_FIREBASE_ENV_KEYS)[number]>;
}

export interface CloudUser {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  emailVerified: boolean;
  providerIds: string[];
}

export interface ProjectMember {
  uid: string;
  role: ProjectRole;
  active: boolean;
}

export interface CloudEnvelope {
  state: TrackerState;
  revision: number;
  updatedBy: string;
  updatedAtClient: string;
}

export interface CloudRevisionBase {
  state: TrackerState;
  revision: number;
}

export interface CloudInitializationResult {
  envelope: CloudEnvelope;
  created: boolean;
}

export interface CloudSaveResult {
  envelope: CloudEnvelope;
  merged: boolean;
  initialized: boolean;
  previousRevision: number;
}

export type CloudUnsubscribe = () => void;

export type CloudErrorCode =
  | "configuration-missing"
  | "browser-required"
  | "authentication-required"
  | "invalid-cloud-data"
  | "invalid-membership"
  | "inactive-membership"
  | "tutor-role-required"
  | "firestore-contract-rejected"
  | "invalid-tutor-content"
  | "tutor-live-run-conflict"
  | "conflict-base-missing"
  | "permission-denied"
  | "popup-blocked"
  | "popup-cancelled"
  | "invalid-credentials"
  | "provider-disabled"
  | "user-disabled"
  | "too-many-requests"
  | "unauthorized-domain"
  | "network-unavailable"
  | "service-unavailable"
  | "unknown";

const FRIENDLY_ERROR_MESSAGES: Record<CloudErrorCode, string> = {
  "configuration-missing":
    "Cloud sync has not been configured for this deployment.",
  "browser-required": "Cloud sync is available only in the browser.",
  "authentication-required": "Sign in before using cloud sync.",
  "invalid-cloud-data":
    "The saved cloud record is not a valid Hamad CFA Mastery tracker.",
  "invalid-membership":
    "This account's Hamad CFA Mastery membership record is invalid. Ask the tutor to check Firebase.",
  "inactive-membership":
    "This account does not have an active Hamad CFA Mastery membership. Ask the project owner to check Firebase.",
  "tutor-role-required":
    "This private Session Mode action requires the active tutor account.",
  "firestore-contract-rejected":
    "Firebase rejected this private Session Mode operation even though the account is an active tutor. The deployed Firestore rules or write contract may be out of date.",
  "invalid-tutor-content":
    "The tutor playbook or live-session record is invalid and was not saved.",
  "tutor-live-run-conflict":
    "The live session changed on another device. Reload it before saving the next action.",
  "conflict-base-missing":
    "The cloud tracker changed before this device finished loading it. Refresh and try again.",
  "permission-denied":
    "Firebase denied this cloud operation. Verify the account membership and deployed Firestore rules.",
  "popup-blocked":
    "The sign-in popup was blocked. Allow popups for this site and try again.",
  "popup-cancelled": "Google sign-in was cancelled.",
  "invalid-credentials": "The email or password is incorrect.",
  "provider-disabled":
    "This sign-in method is not enabled in the Firebase project.",
  "user-disabled": "This account has been disabled.",
  "too-many-requests":
    "Too many sign-in attempts were made. Wait a moment and try again.",
  "unauthorized-domain":
    "This website address is not authorized for Firebase sign-in.",
  "network-unavailable":
    "Cloud sync could not reach the network. Check the connection and try again.",
  "service-unavailable":
    "Cloud sync is temporarily unavailable. Your browser copy is still available.",
  unknown: "Cloud sync could not complete the request. Please try again.",
};

export class CloudClientError extends Error {
  readonly code: CloudErrorCode;

  constructor(code: CloudErrorCode, cause?: unknown) {
    super(FRIENDLY_ERROR_MESSAGES[code], { cause });
    this.name = "CloudClientError";
    this.code = code;
  }
}

interface FirebaseServices {
  auth: Auth;
  firestore: Firestore;
}

let cachedServices: FirebaseServices | null = null;

function readEnvironmentValue(key: FirebaseEnvironmentKey): string {
  const value = import.meta.env[key];
  return typeof value === "string" ? value.trim() : "";
}

export function getCloudConfigurationStatus(): CloudConfigurationStatus {
  const missingKeys = REQUIRED_FIREBASE_ENV_KEYS.filter(
    key => !readEnvironmentValue(key)
  );
  const missingOptionalKeys = OPTIONAL_FIREBASE_ENV_KEYS.filter(
    key => !readEnvironmentValue(key)
  );

  return {
    configured: missingKeys.length === 0,
    missingKeys: [...missingKeys],
    missingOptionalKeys: [...missingOptionalKeys],
  };
}

export function isCloudConfigured(): boolean {
  return getCloudConfigurationStatus().configured;
}

function buildFirebaseOptions(): FirebaseOptions {
  const status = getCloudConfigurationStatus();
  if (!status.configured) {
    throw new CloudClientError("configuration-missing");
  }

  return {
    apiKey: readEnvironmentValue("VITE_FIREBASE_API_KEY"),
    authDomain: readEnvironmentValue("VITE_FIREBASE_AUTH_DOMAIN"),
    projectId: readEnvironmentValue("VITE_FIREBASE_PROJECT_ID"),
    appId: readEnvironmentValue("VITE_FIREBASE_APP_ID"),
    storageBucket:
      readEnvironmentValue("VITE_FIREBASE_STORAGE_BUCKET") || undefined,
    messagingSenderId:
      readEnvironmentValue("VITE_FIREBASE_MESSAGING_SENDER_ID") || undefined,
    measurementId:
      readEnvironmentValue("VITE_FIREBASE_MEASUREMENT_ID") || undefined,
  };
}

function getFirebaseServices(): FirebaseServices {
  if (typeof window === "undefined") {
    throw new CloudClientError("browser-required");
  }
  if (cachedServices) return cachedServices;

  const existingApp = getApps().find(app => app.name === FIREBASE_APP_NAME);
  const app =
    existingApp ?? initializeApp(buildFirebaseOptions(), FIREBASE_APP_NAME);
  cachedServices = {
    auth: getAuth(app),
    firestore: getFirestore(app),
  };
  return cachedServices;
}

function toCloudUser(user: User): CloudUser {
  return {
    uid: user.uid,
    email: user.email,
    displayName: user.displayName,
    photoURL: user.photoURL,
    emailVerified: user.emailVerified,
    providerIds: user.providerData.map(provider => provider.providerId),
  };
}

function requireAuthenticatedUser(auth: Auth): User {
  if (!auth.currentUser) {
    throw new CloudClientError("authentication-required");
  }
  return auth.currentUser;
}

export function getCurrentCloudUser(): CloudUser | null {
  const { auth } = getFirebaseServices();
  return auth.currentUser ? toCloudUser(auth.currentUser) : null;
}

export function observeAuth(
  onUser: (user: CloudUser | null) => void,
  onError?: (error: CloudClientError) => void
): CloudUnsubscribe {
  const { auth } = getFirebaseServices();
  return onAuthStateChanged(
    auth,
    user => onUser(user ? toCloudUser(user) : null),
    error => onError?.(mapCloudError(error))
  );
}

export async function signInWithGoogle(): Promise<CloudUser> {
  try {
    const { auth } = getFirebaseServices();
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: "select_account" });
    const credential = await signInWithPopup(auth, provider);
    return toCloudUser(credential.user);
  } catch (error) {
    throw mapCloudError(error);
  }
}

export async function signInWithEmailPassword(
  email: string,
  password: string
): Promise<CloudUser> {
  try {
    const { auth } = getFirebaseServices();
    const credential = await signInWithEmailAndPassword(
      auth,
      email.trim(),
      password
    );
    return toCloudUser(credential.user);
  } catch (error) {
    throw mapCloudError(error);
  }
}

export async function signOutCloud(): Promise<void> {
  try {
    const { auth } = getFirebaseServices();
    await signOut(auth);
  } catch (error) {
    throw mapCloudError(error);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export interface PrivateTutorNotesEnvelope {
  notes: PrivateTutorNote[];
  revision: number;
  updatedBy: string;
  updatedAtClient: string;
}

export function parseProjectMember(uid: string, value: unknown): ProjectMember {
  if (!isRecord(value)) {
    throw new CloudClientError("invalid-membership");
  }
  if (
    typeof value.active !== "boolean" ||
    (value.role !== "tutor" && value.role !== "student")
  ) {
    throw new CloudClientError("invalid-membership");
  }
  return { uid, active: value.active, role: value.role };
}

export function parseCloudEnvelope(value: unknown): CloudEnvelope {
  if (!isRecord(value)) {
    throw new CloudClientError("invalid-cloud-data");
  }

  const revision = Number(value.revision);
  const updatedBy = value.updatedBy;
  const updatedAtClient = value.updatedAtClient;
  if (
    !Number.isSafeInteger(revision) ||
    revision < 1 ||
    typeof updatedBy !== "string" ||
    !updatedBy.trim() ||
    typeof updatedAtClient !== "string" ||
    !updatedAtClient.trim() ||
    Number.isNaN(Date.parse(updatedAtClient))
  ) {
    throw new CloudClientError("invalid-cloud-data");
  }

  try {
    return {
      state: normalizeState(value.state),
      revision,
      updatedBy,
      updatedAtClient,
    };
  } catch (error) {
    throw new CloudClientError("invalid-cloud-data", error);
  }
}

function trackerDocument(firestore: Firestore) {
  return doc(firestore, "programs", PROGRAM_ID, "tracker", "current");
}

export function parsePrivateTutorNotesEnvelope(
  value: unknown
): PrivateTutorNotesEnvelope {
  if (!isRecord(value)) throw new CloudClientError("invalid-cloud-data");
  const revision = Number(value.revision);
  if (
    !Number.isSafeInteger(revision) ||
    revision < 1 ||
    typeof value.updatedBy !== "string" ||
    typeof value.updatedAtClient !== "string" ||
    Number.isNaN(Date.parse(value.updatedAtClient))
  ) {
    throw new CloudClientError("invalid-cloud-data");
  }
  return {
    notes: normalizePrivateTutorNotes(value.notes),
    revision,
    updatedBy: value.updatedBy,
    updatedAtClient: value.updatedAtClient,
  };
}

function memberDocument(firestore: Firestore, uid: string) {
  return doc(firestore, "programs", PROGRAM_ID, "members", uid);
}

function privateTutorNotesDocument(firestore: Firestore) {
  return doc(firestore, "programs", PROGRAM_ID, "tutorPrivate", "notes");
}

function tutorPlaybookDocument(firestore: Firestore, playbookId: string) {
  return doc(firestore, "programs", PROGRAM_ID, "tutorPlaybooks", playbookId);
}

function tutorPlaybookChunkDocument(
  firestore: Firestore,
  playbookId: string,
  storageId: string
) {
  return doc(
    firestore,
    "programs",
    PROGRAM_ID,
    "tutorPlaybooks",
    playbookId,
    "chunks",
    storageId
  );
}

function tutorLiveRunDocument(firestore: Firestore, runId: string) {
  return doc(firestore, "programs", PROGRAM_ID, "tutorRuns", runId);
}

export function subscribeToPrivateTutorNotes(
  onEnvelope: (envelope: PrivateTutorNotesEnvelope | null) => void,
  onError?: (error: CloudClientError) => void
): CloudUnsubscribe {
  const { auth, firestore } = getFirebaseServices();
  requireAuthenticatedUser(auth);
  return onSnapshot(
    privateTutorNotesDocument(firestore),
    snapshot => {
      if (!snapshot.exists()) return onEnvelope(null);
      try {
        onEnvelope(parsePrivateTutorNotesEnvelope(snapshot.data()));
      } catch (error) {
        onError?.(mapCloudError(error));
      }
    },
    error => onError?.(mapCloudError(error))
  );
}

export async function mutatePrivateTutorNotes(
  recipe: (notes: PrivateTutorNote[]) => PrivateTutorNote[]
): Promise<PrivateTutorNotesEnvelope> {
  try {
    const { auth, firestore } = getFirebaseServices();
    const user = requireAuthenticatedUser(auth);
    const reference = privateTutorNotesDocument(firestore);
    return await runTransaction(firestore, async transaction => {
      const snapshot = await transaction.get(reference);
      const current = snapshot.exists()
        ? parsePrivateTutorNotesEnvelope(snapshot.data())
        : null;
      const updatedAtClient = new Date().toISOString();
      const envelope: PrivateTutorNotesEnvelope = {
        notes: normalizePrivateTutorNotes(recipe(current?.notes ?? [])),
        revision: (current?.revision ?? 0) + 1,
        updatedBy: user.uid,
        updatedAtClient,
      };
      transaction.set(reference, envelope);
      return envelope;
    });
  } catch (error) {
    throw mapCloudError(error);
  }
}

export function observeCurrentProjectMember(
  onMember: (member: ProjectMember | null) => void,
  onError?: (error: CloudClientError) => void
): CloudUnsubscribe {
  const { auth, firestore } = getFirebaseServices();
  const user = requireAuthenticatedUser(auth);

  return onSnapshot(
    memberDocument(firestore, user.uid),
    snapshot => {
      if (!snapshot.exists()) {
        onMember(null);
        return;
      }
      try {
        onMember(parseProjectMember(user.uid, snapshot.data()));
      } catch (error) {
        onError?.(mapCloudError(error));
      }
    },
    error => onError?.(mapCloudError(error))
  );
}

function createEnvelope(
  state: TrackerState,
  revision: number,
  updatedBy: string
): CloudEnvelope {
  const updatedAtClient = new Date().toISOString();
  return {
    state: normalizeState({ ...state, updatedAt: updatedAtClient }),
    revision,
    updatedBy,
    updatedAtClient,
  };
}

export function subscribeToCloudTracker(
  onEnvelope: (envelope: CloudEnvelope | null) => void,
  onError?: (error: CloudClientError) => void
): CloudUnsubscribe {
  const { auth, firestore } = getFirebaseServices();
  requireAuthenticatedUser(auth);

  return onSnapshot(
    trackerDocument(firestore),
    snapshot => {
      if (!snapshot.exists()) {
        onEnvelope(null);
        return;
      }
      try {
        onEnvelope(parseCloudEnvelope(snapshot.data()));
      } catch (error) {
        onError?.(mapCloudError(error));
      }
    },
    error => onError?.(mapCloudError(error))
  );
}

export async function initializeCloudTracker(
  initialState: TrackerState
): Promise<CloudInitializationResult> {
  try {
    const { auth, firestore } = getFirebaseServices();
    const user = requireAuthenticatedUser(auth);
    const reference = trackerDocument(firestore);
    const safeInitialState = normalizeState(initialState);

    return await runTransaction(firestore, async transaction => {
      const snapshot = await transaction.get(reference);
      if (snapshot.exists()) {
        return {
          envelope: parseCloudEnvelope(snapshot.data()),
          created: false,
        };
      }

      const envelope = createEnvelope(safeInitialState, 1, user.uid);
      transaction.set(reference, envelope);
      return { envelope, created: true };
    });
  } catch (error) {
    throw mapCloudError(error);
  }
}

export async function saveCloudTracker(
  localState: TrackerState,
  base: CloudRevisionBase | null
): Promise<CloudSaveResult> {
  try {
    const { auth, firestore } = getFirebaseServices();
    const user = requireAuthenticatedUser(auth);
    const reference = trackerDocument(firestore);
    const safeLocalState = normalizeState(localState);

    return await runTransaction(firestore, async transaction => {
      const snapshot = await transaction.get(reference);
      if (!snapshot.exists()) {
        const envelope = createEnvelope(safeLocalState, 1, user.uid);
        transaction.set(reference, envelope);
        return {
          envelope,
          merged: false,
          initialized: true,
          previousRevision: 0,
        };
      }

      const remoteEnvelope = parseCloudEnvelope(snapshot.data());
      if (!base) {
        throw new CloudClientError("conflict-base-missing");
      }

      const safeBaseState = normalizeState(base.state);
      const revisionChanged = remoteEnvelope.revision !== base.revision;
      const nextState = revisionChanged
        ? mergeTrackerStates(
            safeBaseState,
            safeLocalState,
            remoteEnvelope.state
          )
        : safeLocalState;
      const envelope = createEnvelope(
        nextState,
        remoteEnvelope.revision + 1,
        user.uid
      );

      transaction.set(reference, envelope);
      return {
        envelope,
        merged: revisionChanged,
        initialized: false,
        previousRevision: remoteEnvelope.revision,
      };
    });
  } catch (error) {
    throw mapCloudError(error);
  }
}

/**
 * Replaces the synchronized state without applying the normal three-way merge.
 * Firestore Rules restrict this operation to the tutor account. It is intended
 * for an explicitly confirmed import or pre-launch reset.
 */
export async function replaceCloudTracker(
  replacementState: TrackerState
): Promise<CloudEnvelope> {
  try {
    const { auth, firestore } = getFirebaseServices();
    const user = requireAuthenticatedUser(auth);
    const reference = trackerDocument(firestore);
    const safeState = normalizeState(replacementState);

    return await runTransaction(firestore, async transaction => {
      const snapshot = await transaction.get(reference);
      const revision = snapshot.exists()
        ? parseCloudEnvelope(snapshot.data()).revision + 1
        : 1;
      const envelope = createEnvelope(safeState, revision, user.uid);
      transaction.set(reference, envelope);
      return envelope;
    });
  } catch (error) {
    throw mapCloudError(error);
  }
}

function mapTutorCloudError(error: unknown): CloudClientError {
  if (error instanceof TutorContentValidationError) {
    return new CloudClientError("invalid-tutor-content", error);
  }
  if (error instanceof TutorLiveRunConflictError) {
    return new CloudClientError("tutor-live-run-conflict", error);
  }
  return mapCloudError(error);
}

/**
 * Reads the active tutor-only manifest. Firestore Rules are the authorization
 * boundary: Hamad's student account cannot read this path even when it knows
 * the document ID.
 */
export async function getTutorPlaybookManifest(
  playbookIdValue: string
): Promise<TutorPlaybookManifest | null> {
  try {
    const playbookId = parseTutorContentId(playbookIdValue, "playbookId");
    const { auth, firestore } = getFirebaseServices();
    requireAuthenticatedUser(auth);
    const snapshot = await getDoc(tutorPlaybookDocument(firestore, playbookId));
    return snapshot.exists()
      ? parseTutorPlaybookManifest(snapshot.data())
      : null;
  } catch (error) {
    throw mapTutorCloudError(error);
  }
}

/** Reads one immutable, versioned tutor-only playbook chunk. */
export async function getTutorPlaybookChunk(
  playbookIdValue: string,
  versionValue: string,
  chunkIdValue: string
): Promise<TutorPlaybookChunk | null> {
  try {
    const playbookId = parseTutorContentId(playbookIdValue, "playbookId");
    const version = parseTutorContentId(versionValue, "version");
    const chunkId = parseTutorContentId(chunkIdValue, "chunkId");
    const storageId = buildTutorPlaybookChunkStorageId(
      playbookId,
      version,
      chunkId
    );
    const { auth, firestore } = getFirebaseServices();
    requireAuthenticatedUser(auth);
    const snapshot = await getDoc(
      tutorPlaybookChunkDocument(firestore, playbookId, storageId)
    );
    if (!snapshot.exists()) return null;
    const chunk = parseTutorPlaybookChunk(snapshot.data());
    if (
      chunk.playbookId !== playbookId ||
      chunk.version !== version ||
      chunk.id !== chunkId
    ) {
      throw new TutorContentValidationError(
        "The stored tutor chunk does not match its requested path."
      );
    }
    return chunk;
  } catch (error) {
    throw mapTutorCloudError(error);
  }
}

/**
 * Loads and cross-validates the complete active playbook. Reads are issued in
 * small groups so a large Tutor Bible does not create a request spike.
 */
export async function loadTutorPlaybookPackage(
  playbookIdValue: string
): Promise<TutorPlaybookPackage | null> {
  try {
    const manifest = await getTutorPlaybookManifest(playbookIdValue);
    if (!manifest) return null;
    const chunks: TutorPlaybookChunk[] = [];
    const readGroupSize = 10;
    for (
      let start = 0;
      start < manifest.chunkIds.length;
      start += readGroupSize
    ) {
      const ids = manifest.chunkIds.slice(start, start + readGroupSize);
      const group = await Promise.all(
        ids.map(chunkId =>
          getTutorPlaybookChunk(manifest.id, manifest.version, chunkId)
        )
      );
      group.forEach((chunk, index) => {
        if (!chunk) {
          throw new TutorContentValidationError(
            `Missing published chunk ${ids[index]} for ${manifest.id}.`
          );
        }
        chunks.push(chunk);
      });
    }
    const validated = validateTutorPlaybookPackage(manifest, chunks);
    await verifyTutorPlaybookPackageIntegrity(
      tutorPlaybookPackageToDraft(validated.manifest, validated.chunks)
    );
    return validated;
  } catch (error) {
    throw mapTutorCloudError(error);
  }
}

/**
 * Publishes a private JSON package from Mohamed's device. Chunk documents are
 * immutable and versioned. The active manifest changes only after every chunk
 * has been safely written, so a failed import cannot replace a working Bible.
 */
export async function importTutorPlaybookPackage(
  packageValue: unknown
): Promise<TutorPlaybookPackage> {
  try {
    const draft = await verifyTutorPlaybookPackageIntegrity(packageValue);
    const { auth, firestore } = getFirebaseServices();
    const user = requireAuthenticatedUser(auth);
    const manifestReference = tutorPlaybookDocument(
      firestore,
      draft.manifest.id
    );
    const initialManifestSnapshot = await getDoc(manifestReference);
    const initialManifest = initialManifestSnapshot.exists()
      ? parseTutorPlaybookManifest(initialManifestSnapshot.data())
      : null;

    if (
      initialManifest?.version === draft.manifest.version &&
      initialManifest.contentHash !== draft.manifest.contentHash
    ) {
      throw new TutorContentValidationError(
        "A published version is immutable. Change the playbook version before republishing changed content."
      );
    }
    if (
      initialManifest?.version === draft.manifest.version &&
      initialManifest.contentHash === draft.manifest.contentHash
    ) {
      const existing = await loadTutorPlaybookPackage(draft.manifest.id);
      if (!existing) {
        throw new TutorContentValidationError(
          "The active playbook manifest exists but its chunks could not be loaded."
        );
      }
      return existing;
    }

    const publishedAtClient = new Date().toISOString();
    const publishedChunks: TutorPlaybookChunk[] = draft.chunks.map(chunk =>
      parseTutorPlaybookChunk({
        ...chunk,
        playbookId: draft.manifest.id,
        version: draft.manifest.version,
        storageId: buildTutorPlaybookChunkStorageId(
          draft.manifest.id,
          draft.manifest.version,
          chunk.id
        ),
        publishedBy: user.uid,
        publishedAtClient,
      })
    );

    const chunksToCreate: TutorPlaybookChunk[] = [];
    for (let start = 0; start < publishedChunks.length; start += 10) {
      const group = publishedChunks.slice(start, start + 10);
      const snapshots = await Promise.all(
        group.map(chunk =>
          getDoc(
            tutorPlaybookChunkDocument(
              firestore,
              draft.manifest.id,
              chunk.storageId
            )
          )
        )
      );
      snapshots.forEach((snapshot, index) => {
        const candidate = group[index]!;
        if (!snapshot.exists()) {
          chunksToCreate.push(candidate);
          return;
        }
        const existing = parseTutorPlaybookChunk(snapshot.data());
        if (
          existing.playbookId !== candidate.playbookId ||
          existing.version !== candidate.version ||
          existing.id !== candidate.id ||
          existing.contentHash !== candidate.contentHash
        ) {
          throw new TutorContentValidationError(
            `Published chunk ${candidate.storageId} conflicts with an existing immutable chunk.`
          );
        }
      });
    }

    // Ten 450 KB chunks remain comfortably below Firestore's 10 MiB request
    // ceiling. A partially completed retry is safe because existing immutable
    // chunks are verified and skipped above.
    for (let start = 0; start < chunksToCreate.length; start += 10) {
      const batch = writeBatch(firestore);
      chunksToCreate.slice(start, start + 10).forEach(chunk => {
        batch.set(
          tutorPlaybookChunkDocument(
            firestore,
            draft.manifest.id,
            chunk.storageId
          ),
          chunk
        );
      });
      await batch.commit();
    }

    const manifest = await runTransaction(firestore, async transaction => {
      const snapshot = await transaction.get(manifestReference);
      const current = snapshot.exists()
        ? parseTutorPlaybookManifest(snapshot.data())
        : null;
      const manifestChangedDuringUpload = initialManifest
        ? !current || current.revision !== initialManifest.revision
        : Boolean(current);
      if (
        manifestChangedDuringUpload &&
        !(
          current?.version === draft.manifest.version &&
          current.contentHash === draft.manifest.contentHash
        )
      ) {
        throw new TutorLiveRunConflictError(
          "The active Tutor Bible changed while this version was uploading."
        );
      }
      if (
        current?.version === draft.manifest.version &&
        current.contentHash === draft.manifest.contentHash
      ) {
        return current;
      }
      if (
        current?.version === draft.manifest.version &&
        current.contentHash !== draft.manifest.contentHash
      ) {
        throw new TutorContentValidationError(
          "A published version is immutable. Use a new playbook version."
        );
      }
      const next = parseTutorPlaybookManifest({
        ...draft.manifest,
        revision: (current?.revision ?? 0) + 1,
        publishedBy: user.uid,
        publishedAtClient,
      });
      transaction.set(manifestReference, next);
      return next;
    });

    const activeChunks = await Promise.all(
      manifest.chunkIds.map(chunkId =>
        getTutorPlaybookChunk(manifest.id, manifest.version, chunkId)
      )
    );
    if (activeChunks.some(chunk => !chunk)) {
      throw new TutorContentValidationError(
        "The manifest was published, but a protected chunk could not be verified."
      );
    }
    return validateTutorPlaybookPackage(
      manifest,
      activeChunks as TutorPlaybookChunk[]
    );
  } catch (error) {
    throw mapTutorCloudError(error);
  }
}

/** Returns one private live-session run by its deterministic ID. */
export async function getTutorLiveRun(
  runIdValue: string
): Promise<TutorLiveRun | null> {
  try {
    const runId = parseTutorContentId(runIdValue, "runId");
    const { auth, firestore } = getFirebaseServices();
    requireAuthenticatedUser(auth);
    const snapshot = await getDoc(tutorLiveRunDocument(firestore, runId));
    return snapshot.exists() ? parseTutorLiveRun(snapshot.data()) : null;
  } catch (error) {
    throw mapTutorCloudError(error);
  }
}

/**
 * Performs a server-only tutor-run read for readiness checks. Unlike getDoc,
 * this cannot report a cached result while the device is offline; a missing
 * document still proves that Firebase Auth and the deployed tutor-only rule
 * accepted the request.
 */
export async function probeTutorLiveRunAccess(
  runIdValue: string
): Promise<void> {
  try {
    const runId = parseTutorContentId(runIdValue, "runId");
    const { auth, firestore } = getFirebaseServices();
    requireAuthenticatedUser(auth);
    await getDocFromServer(tutorLiveRunDocument(firestore, runId));
  } catch (error) {
    throw mapTutorCloudError(error);
  }
}

/**
 * Persists exactly one meaningful tutor action. There is intentionally no
 * timer-tick action: the UI keeps the clock locally and saves starts, pauses,
 * navigation, assessments, repairs, notes, and terminal actions only.
 */
export async function saveTutorLiveRun(
  requestValue: TutorLiveRunSaveRequest
): Promise<TutorLiveRun> {
  try {
    const request = parseTutorLiveRunSaveRequest(requestValue);
    const { auth, firestore } = getFirebaseServices();
    const user = requireAuthenticatedUser(auth);
    const reference = tutorLiveRunDocument(firestore, request.runId);
    return await runTransaction(firestore, async transaction => {
      const snapshot = await transaction.get(reference);
      const current = snapshot.exists()
        ? parseTutorLiveRun(snapshot.data())
        : null;
      const next = applyTutorLiveRunAction(current, request, user.uid);
      transaction.set(reference, next);
      return next;
    });
  } catch (error) {
    throw mapTutorCloudError(error);
  }
}

/** Deletes a private live run. Firestore Rules restrict deletion to the tutor. */
export async function deleteTutorLiveRun(runIdValue: string): Promise<void> {
  try {
    const runId = parseTutorContentId(runIdValue, "runId");
    const { auth, firestore } = getFirebaseServices();
    requireAuthenticatedUser(auth);
    await deleteDoc(tutorLiveRunDocument(firestore, runId));
  } catch (error) {
    throw mapTutorCloudError(error);
  }
}

function firebaseErrorCode(error: unknown): string {
  if (error instanceof FirebaseError) return error.code;
  if (isRecord(error) && typeof error.code === "string") return error.code;
  return "";
}

export function mapCloudError(error: unknown): CloudClientError {
  if (error instanceof CloudClientError) return error;

  const code = firebaseErrorCode(error);
  const mappedCode: CloudErrorCode = (() => {
    switch (code) {
      case "auth/popup-blocked":
        return "popup-blocked";
      case "auth/popup-closed-by-user":
      case "auth/cancelled-popup-request":
        return "popup-cancelled";
      case "auth/invalid-credential":
      case "auth/invalid-email":
      case "auth/user-not-found":
      case "auth/wrong-password":
        return "invalid-credentials";
      case "auth/operation-not-allowed":
        return "provider-disabled";
      case "auth/user-disabled":
        return "user-disabled";
      case "auth/too-many-requests":
        return "too-many-requests";
      case "auth/unauthorized-domain":
        return "unauthorized-domain";
      case "auth/network-request-failed":
        return "network-unavailable";
      case "permission-denied":
      case "firestore/permission-denied":
        return "permission-denied";
      case "unavailable":
      case "firestore/unavailable":
        return "service-unavailable";
      default:
        return "unknown";
    }
  })();

  return new CloudClientError(mappedCode, error);
}

/**
 * Refines Firestore's deliberately broad `permission-denied` response for a
 * tutor-only operation. Firestore uses the same code when membership fails and
 * when an otherwise authorized write does not satisfy the deployed rules, so
 * the generic code alone must not be presented as proof that the account is
 * unauthorized.
 */
export async function diagnoseTutorCloudError(
  error: unknown
): Promise<CloudClientError> {
  const cloudError = mapCloudError(error);
  if (cloudError.code !== "permission-denied") return cloudError;

  try {
    const { auth, firestore } = getFirebaseServices();
    const user = requireAuthenticatedUser(auth);
    const snapshot = await getDocFromServer(
      memberDocument(firestore, user.uid)
    );
    if (!snapshot.exists()) {
      return new CloudClientError("inactive-membership", cloudError);
    }

    const member = parseProjectMember(user.uid, snapshot.data());
    if (!member.active) {
      return new CloudClientError("inactive-membership", cloudError);
    }
    if (member.role !== "tutor") {
      return new CloudClientError("tutor-role-required", cloudError);
    }
    return new CloudClientError("firestore-contract-rejected", cloudError);
  } catch (probeError) {
    const probeCloudError = mapCloudError(probeError);
    if (
      probeCloudError.code === "authentication-required" ||
      probeCloudError.code === "invalid-membership"
    ) {
      return probeCloudError;
    }
    return cloudError;
  }
}

export function getCloudErrorMessage(error: unknown): string {
  return mapCloudError(error).message;
}
