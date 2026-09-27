import { useEffect, useState } from "react";
import { MOCK_MODULES } from "../data/mockModules";
import { getShellBusy, subscribeShellBusy } from "../lib/shellBusy";
import type { TodayPendingModuleTest } from "../lib/todayQueue";

/**
 * The parts of Today that live outside the tracker: spaced-review state on
 * this device (IndexedDB, filled whenever Practice syncs) and the module
 * tests still to take (Firestore). Both load after Home paints, through
 * dynamic imports so neither reaches the Home chunk, and both degrade to
 * null — "unknown" — rather than blocking the tracker-based items.
 */
export interface ModuleTestProgress {
  /** Published tests the student can take. */
  published: number;
  /** Of those, submitted (graded or awaiting grading). */
  completed: number;
}

export interface TodaySources {
  dueReviews: number | null;
  pendingModuleTests: TodayPendingModuleTest[] | null;
  moduleTestProgress: ModuleTestProgress | null;
}

interface ModuleTestStatus {
  pending: TodayPendingModuleTest[];
  progress: ModuleTestProgress;
}

const EMPTY: TodaySources = { dueReviews: null, pendingModuleTests: null, moduleTestProgress: null };
/** Module-test status changes rarely; avoid 20+ reads on every visit to Home. */
const MODULE_TEST_CACHE_MS = 5 * 60_000;
let moduleTestCache: { uid: string; at: number; value: ModuleTestStatus } | null = null;

export function clearTodaySourcesCache(): void {
  moduleTestCache = null;
}

// Taking a module test changes what is pending: drop the cache when one starts or ends.
subscribeShellBusy(() => {
  if (getShellBusy() === "mock") moduleTestCache = null;
});

async function loadDueReviews(uid: string, nowMs: number): Promise<number | null> {
  const { loadCachedPracticeBanks, loadCachedPracticeStates } = await import("../lib/practiceOffline");
  const [banks, states] = await Promise.all([loadCachedPracticeBanks(), loadCachedPracticeStates(uid)]);
  if (!banks.length) return null;
  // Only questions in the banks assigned to this device can be served by a review set.
  const available = new Set(banks.flatMap((bank) => bank.questions.map((question) => question.id)));
  return states.filter((state) => available.has(state.questionId) && Date.parse(state.dueAt) <= nowMs).length;
}

async function loadReminderDeadlines(uid: string): Promise<Map<string, string>> {
  const { loadMyReminderDeadlines } = await import("../lib/cloudMockReminders");
  return loadMyReminderDeadlines(uid);
}

async function loadModuleTestStatus(uid: string): Promise<ModuleTestStatus> {
  const { getMockAttempt, getMockTestMeta } = await import("../lib/cloudMockTests");
  const [statuses, deadlines] = await Promise.all([
    Promise.all(MOCK_MODULES.map(async (module) => {
      const meta = await getMockTestMeta(module.id);
      if (!meta || meta.status !== "published") return { module, state: "unpublished" as const };
      const attempt = await getMockAttempt(uid, module.id);
      if (!attempt) return { module, state: "pending" as const };
      return { module, state: attempt.status === "active" ? "active" as const : "done" as const };
    })),
    loadReminderDeadlines(uid),
  ]);
  return {
    pending: statuses.flatMap(({ module, state }) => state === "pending" || state === "active"
      ? [{ moduleId: module.id, title: module.title, deadline: deadlines.get(module.id) ?? null, inProgress: state === "active" }]
      : []),
    progress: {
      published: statuses.filter(({ state }) => state !== "unpublished").length,
      completed: statuses.filter(({ state }) => state === "done").length,
    },
  };
}

function whenIdle(callback: () => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  const idle = (window as Window & { requestIdleCallback?: (cb: () => void, options?: { timeout: number }) => number }).requestIdleCallback;
  if (typeof idle === "function") {
    const handle = idle(callback, { timeout: 1500 });
    return () => (window as Window & { cancelIdleCallback?: (handle: number) => void }).cancelIdleCallback?.(handle);
  }
  const handle = window.setTimeout(callback, 200);
  return () => window.clearTimeout(handle);
}

/** Student only: a tutor's Home shows the tracker-based items. `uid` null disables loading. */
export function useTodaySources(uid: string | null): TodaySources {
  const [sources, setSources] = useState<TodaySources>(() =>
    uid && moduleTestCache?.uid === uid
      ? { dueReviews: null, pendingModuleTests: moduleTestCache.value.pending, moduleTestProgress: moduleTestCache.value.progress }
      : EMPTY,
  );

  useEffect(() => {
    if (!uid) {
      setSources(EMPTY);
      return;
    }
    let active = true;
    const cancel = whenIdle(() => {
      loadDueReviews(uid, Date.now())
        .catch(() => null)
        .then((dueReviews) => { if (active) setSources((current) => ({ ...current, dueReviews })); });

      if (moduleTestCache?.uid === uid && Date.now() - moduleTestCache.at < MODULE_TEST_CACHE_MS) {
        const cached = moduleTestCache.value;
        setSources((current) => ({ ...current, pendingModuleTests: cached.pending, moduleTestProgress: cached.progress }));
        return;
      }
      loadModuleTestStatus(uid)
        .then((status) => {
          moduleTestCache = { uid, at: Date.now(), value: status };
          return status;
        })
        .catch(() => null)
        .then((status) => {
          if (active) setSources((current) => ({ ...current, pendingModuleTests: status?.pending ?? null, moduleTestProgress: status?.progress ?? null }));
        });
    });
    return () => {
      active = false;
      cancel();
    };
  }, [uid]);

  return sources;
}
