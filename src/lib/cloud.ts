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
  doc,
  getFirestore,
  onSnapshot,
  runTransaction,
  type Firestore,
} from "firebase/firestore";
import type { TrackerState } from "../types";
import { mergeTrackerStates } from "./stateMerge";
import { normalizeState } from "./storage";

const FIREBASE_APP_NAME = "project-202-cloud";
const PROGRAM_ID = "project-202";

export const CLOUD_TRACKER_DOCUMENT_PATH =
  "programs/project-202/tracker/current" as const;

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
    "The saved cloud record is not a valid Project 202 tracker.",
  "conflict-base-missing":
    "The cloud tracker changed before this device finished loading it. Refresh and try again.",
  "permission-denied":
    "This account is not authorized to access Hamad's tracker.",
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
    (key) => !readEnvironmentValue(key),
  );
  const missingOptionalKeys = OPTIONAL_FIREBASE_ENV_KEYS.filter(
    (key) => !readEnvironmentValue(key),
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

  const existingApp = getApps().find((app) => app.name === FIREBASE_APP_NAME);
  const app = existingApp ?? initializeApp(buildFirebaseOptions(), FIREBASE_APP_NAME);
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
    providerIds: user.providerData.map((provider) => provider.providerId),
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
  onError?: (error: CloudClientError) => void,
): CloudUnsubscribe {
  const { auth } = getFirebaseServices();
  return onAuthStateChanged(
    auth,
    (user) => onUser(user ? toCloudUser(user) : null),
    (error) => onError?.(mapCloudError(error)),
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
  password: string,
): Promise<CloudUser> {
  try {
    const { auth } = getFirebaseServices();
    const credential = await signInWithEmailAndPassword(
      auth,
      email.trim(),
      password,
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

function createEnvelope(
  state: TrackerState,
  revision: number,
  updatedBy: string,
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
  onError?: (error: CloudClientError) => void,
): CloudUnsubscribe {
  const { auth, firestore } = getFirebaseServices();
  requireAuthenticatedUser(auth);

  return onSnapshot(
    trackerDocument(firestore),
    (snapshot) => {
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
    (error) => onError?.(mapCloudError(error)),
  );
}

export async function initializeCloudTracker(
  initialState: TrackerState,
): Promise<CloudInitializationResult> {
  try {
    const { auth, firestore } = getFirebaseServices();
    const user = requireAuthenticatedUser(auth);
    const reference = trackerDocument(firestore);
    const safeInitialState = normalizeState(initialState);

    return await runTransaction(firestore, async (transaction) => {
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
  base: CloudRevisionBase | null,
): Promise<CloudSaveResult> {
  try {
    const { auth, firestore } = getFirebaseServices();
    const user = requireAuthenticatedUser(auth);
    const reference = trackerDocument(firestore);
    const safeLocalState = normalizeState(localState);

    return await runTransaction(firestore, async (transaction) => {
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
            remoteEnvelope.state,
          )
        : safeLocalState;
      const envelope = createEnvelope(
        nextState,
        remoteEnvelope.revision + 1,
        user.uid,
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

export function getCloudErrorMessage(error: unknown): string {
  return mapCloudError(error).message;
}
