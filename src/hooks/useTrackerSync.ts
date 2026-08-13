import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import type { PrivateTutorNote, TrackerState } from "../types";
import {
  getCloudConfigurationStatus,
  getCloudErrorMessage,
  initializeCloudTracker,
  mapCloudError,
  mutatePrivateTutorNotes,
  observeCurrentProjectMember,
  observeAuth,
  replaceCloudTracker,
  saveCloudTracker,
  signInWithEmailPassword as cloudSignInWithEmailPassword,
  signInWithGoogle as cloudSignInWithGoogle,
  signOutCloud,
  subscribeToCloudTracker,
  subscribeToPrivateTutorNotes,
  type CloudRevisionBase,
  type CloudUser,
  type ProjectMember,
} from "../lib/cloud";
import {
  capabilitiesForRole,
  type ProjectCapabilities,
  type ProjectRole,
} from "../lib/permissions";
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
  member: ProjectMember | null;
  memberReady: boolean;
  role: ProjectRole | null;
  capabilities: ProjectCapabilities;
  accessDenied: boolean;
  trackerReady: boolean;
  syncStatus: TrackerSyncStatus;
  syncError: string | null;
  signInWithGoogle: () => Promise<void>;
  signInWithPassword: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  replaceTrackerAuthoritatively: (state: TrackerState) => Promise<void>;
  authoritativeReplaceBusy: boolean;
  retrySync: () => void;
  privateTutorNotes: PrivateTutorNote[];
  privateNotesReady: boolean;
  privateNotesBusy: boolean;
  privateNotesError: string | null;
  updatePrivateTutorNotes: (
    recipe: (notes: PrivateTutorNote[]) => PrivateTutorNote[],
  ) => Promise<void>;
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
  const [member, setMember] = useState<ProjectMember | null>(null);
  const [memberReady, setMemberReady] = useState(!configuration.configured);
  const [authReady, setAuthReady] = useState(!configuration.configured);
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [trackerReady, setTrackerReady] = useState(false);
  const [accessDenied, setAccessDenied] = useState(false);
  const [syncStatus, setSyncStatus] =
    useState<TrackerSyncStatus>("loading");
  const [syncError, setSyncError] = useState<string | null>(null);
  const [authoritativeReplaceBusy, setAuthoritativeReplaceBusy] =
    useState(false);
  const [privateTutorNotes, setPrivateTutorNotes] = useState<PrivateTutorNote[]>([]);
  const [privateNotesReady, setPrivateNotesReady] = useState(false);
  const [privateNotesBusy, setPrivateNotesBusy] = useState(false);
  const [privateNotesError, setPrivateNotesError] = useState<string | null>(null);

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
        setMember(null);
        setMemberReady(!nextUser);
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
    setMemberReady(false);
    setMember(null);

    return observeCurrentProjectMember(
      (nextMember) => {
        setMember(nextMember);
        setMemberReady(true);
        if (!nextMember || !nextMember.active) {
          setAccessDenied(true);
          setTrackerReady(false);
          setSyncError(
            "This account is not an active Project 202 member. Ask the tutor to check Firebase.",
          );
          setSyncStatus("error");
          return;
        }
        setAccessDenied(false);
        setSyncError(null);
      },
      (error) => {
        setMember(null);
        setMemberReady(true);
        setAccessDenied(true);
        setTrackerReady(false);
        setSyncError(error.message);
        setSyncStatus("error");
      },
    );
  }, [configuration.configured, user]);

  useEffect(() => {
    setPrivateTutorNotes([]);
    setPrivateNotesError(null);
    if (!configuration.configured || !user || member?.role !== "tutor" || !member.active) {
      setPrivateNotesReady(member?.role !== "tutor");
      return;
    }
    setPrivateNotesReady(false);
    return subscribeToPrivateTutorNotes(
      (envelope) => {
        setPrivateTutorNotes(envelope?.notes ?? []);
        setPrivateNotesReady(true);
      },
      (error) => {
        setPrivateNotesError(error.message);
        setPrivateNotesReady(true);
      },
    );
  }, [configuration.configured, member, user]);

  useEffect(() => {
    if (
      !configuration.configured ||
      !user ||
      !memberReady ||
      !member?.active
    ) {
      return;
    }
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
    member,
    memberReady,
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

  const replaceTrackerAuthoritatively = useCallback(
    async (state: TrackerState) => {
      if (!member?.active || member.role !== "tutor") {
        throw new Error("Only the Project 202 tutor can replace shared progress.");
      }

      setAuthoritativeReplaceBusy(true);
      setSyncError(null);
      setSyncStatus("saving");
      if (flushTimerRef.current !== null) {
        window.clearTimeout(flushTimerRef.current);
        flushTimerRef.current = null;
      }
      while (flushInFlightRef.current) {
        await new Promise<void>((resolve) => window.setTimeout(resolve, 20));
      }

      const previousPending = pendingRef.current;
      pendingRef.current = null;
      clearPendingSync();
      try {
        const envelope = await replaceCloudTracker(normalizeState(state));
        baseRef.current = {
          revision: envelope.revision,
          state: envelope.state,
        };
        setCachedTracker(envelope.state);
        setSyncStatus("synced");
      } catch (error) {
        const cloudError = mapCloudError(error);
        if (previousPending) {
          pendingRef.current = savePendingSync(previousPending);
          scheduleFlush(0);
        }
        setSyncError(cloudError.message);
        if (cloudError.code === "permission-denied") setAccessDenied(true);
        setSyncStatus(
          !onlineNow() || cloudError.code === "network-unavailable"
            ? "offline"
            : "error",
        );
        throw cloudError;
      } finally {
        setAuthoritativeReplaceBusy(false);
      }
    },
    [member, scheduleFlush, setCachedTracker],
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

  const updatePrivateTutorNotes = useCallback(
    async (recipe: (notes: PrivateTutorNote[]) => PrivateTutorNote[]) => {
      if (!member?.active || member.role !== "tutor") {
        throw new Error("Only the Project 202 tutor can access private notes.");
      }
      setPrivateNotesBusy(true);
      setPrivateNotesError(null);
      try {
        const envelope = await mutatePrivateTutorNotes(recipe);
        setPrivateTutorNotes(envelope.notes);
      } catch (error) {
        const message = getCloudErrorMessage(error);
        setPrivateNotesError(message);
        throw error;
      } finally {
        setPrivateNotesBusy(false);
      }
    },
    [member],
  );

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
    member,
    memberReady,
    role: member?.active ? member.role : null,
    capabilities: capabilitiesForRole(member?.active ? member.role : null),
    accessDenied,
    trackerReady,
    syncStatus,
    syncError,
    signInWithGoogle,
    signInWithPassword,
    signOut,
    replaceTrackerAuthoritatively,
    authoritativeReplaceBusy,
    retrySync,
    privateTutorNotes,
    privateNotesReady,
    privateNotesBusy,
    privateNotesError,
    updatePrivateTutorNotes,
  };
}
