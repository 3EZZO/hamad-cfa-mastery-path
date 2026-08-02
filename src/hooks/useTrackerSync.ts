import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import type { TrackerState } from "../types";
import {
  getCloudConfigurationStatus,
  getCloudErrorMessage,
  initializeCloudTracker,
  mapCloudError,
  observeAuth,
  saveCloudTracker,
  signInWithEmailPassword as cloudSignInWithEmailPassword,
  signInWithGoogle as cloudSignInWithGoogle,
  signOutCloud,
  subscribeToCloudTracker,
  type CloudRevisionBase,
  type CloudUser,
} from "../lib/cloud";
import { mergeTrackerStates } from "../lib/stateMerge";
import {
  clearPendingSync,
  createDefaultState,
  loadPendingSync,
  loadState,
  normalizeState,
  savePendingSync,
  saveState,
  type PendingSync,
} from "../lib/storage";

export type TrackerSyncStatus =
  | "loading"
  | "synced"
  | "saving"
  | "offline"
  | "error";

type TrackerRecipe = (current: TrackerState) => TrackerState;

export interface TrackerSyncController {
  tracker: TrackerState;
  updateTracker: (recipe: TrackerRecipe) => void;
  replaceTracker: (state: TrackerState) => void;
  cloudConfigured: boolean;
  missingConfiguration: string[];
  authReady: boolean;
  authBusy: boolean;
  authError: string | null;
  user: CloudUser | null;
  accessDenied: boolean;
  trackerReady: boolean;
  syncStatus: TrackerSyncStatus;
  syncError: string | null;
  signInWithGoogle: () => Promise<void>;
  signInWithPassword: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  retrySync: () => void;
}

function pendingBase(pending: PendingSync): CloudRevisionBase | null {
  if (pending.baseRevision < 1) return null;
  return {
    revision: pending.baseRevision,
    state: pending.baseState,
  };
}

function samePending(left: PendingSync | null, right: PendingSync): boolean {
  return Boolean(left && left.mutationId === right.mutationId);
}

function makeMutationId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function onlineNow(): boolean {
  return typeof navigator === "undefined" || navigator.onLine;
}

export function useTrackerSync(): TrackerSyncController {
  const configuration = getCloudConfigurationStatus();
  const [tracker, setTracker] = useState<TrackerState>(() => loadState());
  const [user, setUser] = useState<CloudUser | null>(null);
  const [authReady, setAuthReady] = useState(!configuration.configured);
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [trackerReady, setTrackerReady] = useState(false);
  const [accessDenied, setAccessDenied] = useState(false);
  const [syncStatus, setSyncStatus] =
    useState<TrackerSyncStatus>("loading");
  const [syncError, setSyncError] = useState<string | null>(null);

  const trackerRef = useRef(tracker);
  const userRef = useRef<CloudUser | null>(null);
  const baseRef = useRef<CloudRevisionBase | null>(null);
  const pendingRef = useRef<PendingSync | null>(loadPendingSync());
  const flushInFlightRef = useRef(false);
  const initializingRef = useRef(false);
  const flushTimerRef = useRef<number | null>(null);
  const flushRef = useRef<() => Promise<void>>(async () => undefined);

  const setCachedTracker = useCallback((state: TrackerState) => {
    const safeState = normalizeState(state);
    trackerRef.current = safeState;
    saveState(safeState);
    setTracker(safeState);
    return safeState;
  }, []);

  const scheduleFlush = useCallback((delay = 450) => {
    if (typeof window === "undefined") return;
    if (flushTimerRef.current !== null) {
      window.clearTimeout(flushTimerRef.current);
    }
    flushTimerRef.current = window.setTimeout(() => {
      flushTimerRef.current = null;
      void flushRef.current();
    }, delay);
  }, []);

  const queueState = useCallback(
    (state: TrackerState) => {
      const safeState = setCachedTracker({
        ...state,
        updatedAt: new Date().toISOString(),
      });
      const existing = pendingRef.current;
      const base = existing
        ? {
            revision: existing.baseRevision,
            state: existing.baseState,
          }
        : baseRef.current ?? {
            revision: 0,
            state: createDefaultState(),
          };
      const pending: PendingSync = {
        version: 1,
        baseRevision: base.revision,
        baseState: base.state,
        localState: safeState,
        queuedAt: existing?.queuedAt ?? new Date().toISOString(),
        mutationId: makeMutationId(),
      };
      pendingRef.current = savePendingSync(pending);
      setSyncError(null);
      setSyncStatus(onlineNow() && userRef.current ? "saving" : "offline");
      scheduleFlush();
    },
    [scheduleFlush, setCachedTracker],
  );

  const flushPending = useCallback(async () => {
    if (flushInFlightRef.current || !userRef.current) return;
    const captured = pendingRef.current;
    if (!captured) {
      if (onlineNow()) setSyncStatus("synced");
      return;
    }
    if (!onlineNow()) {
      setSyncStatus("offline");
      return;
    }

    flushInFlightRef.current = true;
    setSyncStatus("saving");
    setSyncError(null);
    try {
      const result = await saveCloudTracker(
        captured.localState,
        pendingBase(captured),
      );
      const latest = pendingRef.current;
      const acceptedBase: CloudRevisionBase = {
        revision: result.envelope.revision,
        state: result.envelope.state,
      };
      baseRef.current = acceptedBase;

      if (samePending(latest, captured)) {
        pendingRef.current = null;
        clearPendingSync();
        setCachedTracker(result.envelope.state);
        setSyncStatus("synced");
      } else if (latest) {
        const rebased = mergeTrackerStates(
          captured.localState,
          latest.localState,
          result.envelope.state,
        );
        const nextPending: PendingSync = {
          version: 1,
          baseRevision: result.envelope.revision,
          baseState: result.envelope.state,
          localState: {
            ...rebased,
            updatedAt: latest.localState.updatedAt,
          },
          queuedAt: latest.queuedAt,
          mutationId: latest.mutationId,
        };
        pendingRef.current = savePendingSync(nextPending);
        setCachedTracker(nextPending.localState);
        setSyncStatus("saving");
        scheduleFlush(0);
      }
    } catch (error) {
      const cloudError = mapCloudError(error);
      setSyncError(cloudError.message);
      if (cloudError.code === "permission-denied") {
        setAccessDenied(true);
      }
      setSyncStatus(
        !onlineNow() || cloudError.code === "network-unavailable"
          ? "offline"
          : "error",
      );
      if (
        cloudError.code === "network-unavailable" ||
        cloudError.code === "service-unavailable"
      ) {
        scheduleFlush(5_000);
      }
    } finally {
      flushInFlightRef.current = false;
    }
  }, [scheduleFlush, setCachedTracker]);

  useEffect(() => {
    flushRef.current = flushPending;
  }, [flushPending]);

  useEffect(() => {
    return () => {
      if (flushTimerRef.current !== null) {
        window.clearTimeout(flushTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!configuration.configured) return;
    const fallbackTimer = window.setTimeout(() => setAuthReady(true), 4_000);
    const unsubscribe = observeAuth(
      (nextUser) => {
        window.clearTimeout(fallbackTimer);
        userRef.current = nextUser;
        setUser(nextUser);
        setAuthReady(true);
        setAuthError(null);
        setAccessDenied(false);
        if (!nextUser) {
          baseRef.current = null;
          setTrackerReady(false);
          setSyncStatus("loading");
        }
      },
      (error) => {
        window.clearTimeout(fallbackTimer);
        setAuthReady(true);
        setAuthError(error.message);
      },
    );
    return () => {
      window.clearTimeout(fallbackTimer);
      unsubscribe();
    };
  }, [configuration.configured]);

  useEffect(() => {
    if (!configuration.configured || !user) return;
    setTrackerReady(!onlineNow());
    setSyncStatus(onlineNow() ? "loading" : "offline");
    setSyncError(null);

    const acceptEnvelope = (revision: number, state: TrackerState) => {
      const remoteBase = { revision, state };
      let pending = pendingRef.current;
      if (pending) {
        if (pending.baseRevision < 1) {
          const rebased = mergeTrackerStates(
            pending.baseState,
            pending.localState,
            state,
          );
          pending = savePendingSync({
            ...pending,
            baseRevision: revision,
            baseState: state,
            localState: {
              ...rebased,
              updatedAt: pending.localState.updatedAt,
            },
          });
          pendingRef.current = pending;
        }
        baseRef.current = pendingBase(pending) ?? remoteBase;
        setCachedTracker(pending.localState);
        setTrackerReady(true);
        setSyncStatus(onlineNow() ? "saving" : "offline");
        scheduleFlush(0);
        return;
      }
      baseRef.current = remoteBase;
      setCachedTracker(state);
      setTrackerReady(true);
      setSyncStatus(onlineNow() ? "synced" : "offline");
    };

    return subscribeToCloudTracker(
      (envelope) => {
        setAccessDenied(false);
        if (envelope) {
          initializingRef.current = false;
          if (
            pendingRef.current ||
            !baseRef.current ||
            envelope.revision > baseRef.current.revision
          ) {
            acceptEnvelope(envelope.revision, envelope.state);
          }
          return;
        }

        if (initializingRef.current) return;
        initializingRef.current = true;
        const initialState = pendingRef.current?.localState ?? trackerRef.current;
        void initializeCloudTracker(initialState)
          .then((result) => {
            initializingRef.current = false;
            if (result.created) {
              pendingRef.current = null;
              clearPendingSync();
            }
            acceptEnvelope(
              result.envelope.revision,
              result.envelope.state,
            );
          })
          .catch((error) => {
            initializingRef.current = false;
            const cloudError = mapCloudError(error);
            setSyncError(cloudError.message);
            if (cloudError.code === "permission-denied") {
              setAccessDenied(true);
            }
            if (
              cloudError.code === "network-unavailable" ||
              cloudError.code === "service-unavailable"
            ) {
              setTrackerReady(true);
            }
            setSyncStatus(
              !onlineNow() || cloudError.code === "network-unavailable"
                ? "offline"
                : "error",
            );
            if (
              cloudError.code === "network-unavailable" ||
              cloudError.code === "service-unavailable"
            ) {
              scheduleFlush(5_000);
            }
          });
      },
      (error) => {
        setSyncError(error.message);
        if (error.code === "permission-denied") setAccessDenied(true);
        if (
          error.code === "network-unavailable" ||
          error.code === "service-unavailable"
        ) {
          setTrackerReady(true);
        }
        setSyncStatus(
          !onlineNow() || error.code === "network-unavailable"
            ? "offline"
            : "error",
        );
        if (
          error.code === "network-unavailable" ||
          error.code === "service-unavailable"
        ) {
          scheduleFlush(5_000);
        }
      },
    );
  }, [
    configuration.configured,
    scheduleFlush,
    setCachedTracker,
    user,
  ]);

  useEffect(() => {
    const handleOnline = () => {
      setSyncStatus(pendingRef.current ? "saving" : "loading");
      scheduleFlush(0);
    };
    const handleOffline = () => setSyncStatus("offline");
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [scheduleFlush]);

  const updateTracker = useCallback(
    (recipe: TrackerRecipe) => {
      queueState(recipe(trackerRef.current));
    },
    [queueState],
  );

  const replaceTracker = useCallback(
    (state: TrackerState) => queueState(normalizeState(state)),
    [queueState],
  );

  const signInWithGoogle = useCallback(async () => {
    setAuthBusy(true);
    setAuthError(null);
    try {
      await cloudSignInWithGoogle();
    } catch (error) {
      setAuthError(getCloudErrorMessage(error));
    } finally {
      setAuthBusy(false);
    }
  }, []);

  const signInWithPassword = useCallback(
    async (email: string, password: string) => {
      setAuthBusy(true);
      setAuthError(null);
      try {
        await cloudSignInWithEmailPassword(email, password);
      } catch (error) {
        setAuthError(getCloudErrorMessage(error));
      } finally {
        setAuthBusy(false);
      }
    },
    [],
  );

  const signOut = useCallback(async () => {
    setAuthBusy(true);
    setAuthError(null);
    try {
      await flushRef.current();
      await signOutCloud();
    } catch (error) {
      setAuthError(getCloudErrorMessage(error));
    } finally {
      setAuthBusy(false);
    }
  }, []);

  const retrySync = useCallback(() => {
    setAccessDenied(false);
    setSyncError(null);
    setSyncStatus(onlineNow() ? "saving" : "offline");
    scheduleFlush(0);
  }, [scheduleFlush]);

  return {
    tracker,
    updateTracker,
    replaceTracker,
    cloudConfigured: configuration.configured,
    missingConfiguration: configuration.missingKeys,
    authReady,
    authBusy,
    authError,
    user,
    accessDenied,
    trackerReady,
    syncStatus,
    syncError,
    signInWithGoogle,
    signInWithPassword,
    signOut,
    retrySync,
  };
}
