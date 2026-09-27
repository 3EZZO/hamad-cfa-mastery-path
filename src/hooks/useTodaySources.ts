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
export interface TodaySources {
  dueReviews: number | null;
  pendingModuleTests: TodayPendingModuleTest[] | null;
}

const EMPTY: TodaySources = { dueReviews: null, pendingModuleTests: null };
/** Module-test status changes rarely; avoid 20+ reads on every visit to Home. */
const MODULE_TEST_CACHE_MS = 5 * 60_000;
let moduleTestCache: { uid: string; at: number; value: TodayPendingModuleTest[] } | null = null;

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
  const { subscribeToMyMockReminders } = await import("../lib/cloudMockReminders");
  return new Promise((resolve) => {
    let settled = false;
    let unsubscribe: (() => void) | null = null;
    const finish = (deadlines: Map<string, string>) => {
      if (settled) return;
      settled = true;
      unsubscribe?.();
      resolve(deadlines);
    };
    unsubscribe = subscribeToMyMockReminders(
      uid,
      (reminders) => {
        const deadlines = new Map<string, string>();
        reminders.forEach((reminder) => {
          if (!reminder.deadline) return;
          reminder.moduleIds.forEach((moduleId) => {
            const current = deadlines.get(moduleId);
            if (!current || reminder.deadline! < current) deadlines.set(moduleId, reminder.deadline!);
          });
        });
        finish(deadlines);
      },
      () => finish(new Map()),
    );
    if (settled) unsubscribe();
  });
}

async function loadPendingModuleTests(uid: string): Promise<TodayPendingModuleTest[]> {
  const { getMockAttempt, getMockTestMeta } = await import("../lib/cloudMockTests");
  const [statuses, deadlines] = await Promise.all([
    Promise.all(MOCK_MODULES.map(async (module) => {
      const meta = await getMockTestMeta(module.id);
      if (!meta || meta.status !== "published") return null;
      const attempt = await getMockAttempt(uid, module.id);
      return !attempt || attempt.status === "active" ? module : null;
    })),
    loadReminderDeadlines(uid),
  ]);
  return statuses.flatMap((module) => module
    ? [{ moduleId: module.id, title: module.title, deadline: deadlines.get(module.id) ?? null }]
    : []);
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
    uid && moduleTestCache?.uid === uid ? { dueReviews: null, pendingModuleTests: moduleTestCache.value } : EMPTY,
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
        setSources((current) => ({ ...current, pendingModuleTests: cached }));
        return;
      }
      loadPendingModuleTests(uid)
        .then((pendingModuleTests) => {
          moduleTestCache = { uid, at: Date.now(), value: pendingModuleTests };
          return pendingModuleTests;
        })
        .catch(() => null)
        .then((pendingModuleTests) => { if (active) setSources((current) => ({ ...current, pendingModuleTests })); });
    });
    return () => {
      active = false;
      cancel();
    };
  }, [uid]);

  return sources;
}
