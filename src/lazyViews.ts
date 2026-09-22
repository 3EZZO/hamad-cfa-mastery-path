import { lazy } from "react";

/**
 * Code-split entry points for the heavy tracker views.
 *
 * Each factory is exported on its own so tests can prove the chunk resolves
 * and so the shell can warm a chunk up during idle time without rendering it.
 * Keeping these out of the main bundle removes Recharts, the QR renderer, the
 * BA II Plus emulator and the payments ledger from the first paint.
 */
export const loadPracticeCoach = () =>
  import("./features/practice/PracticeCoach").then((module) => ({
    default: module.PracticeCoach,
  }));

export const loadPracticeBankAdmin = () =>
  import("./features/practice/PracticeBankAdmin").then((module) => ({
    default: module.PracticeBankAdmin,
  }));

export const loadPaymentsHub = () =>
  import("./features/payments/PaymentsHub").then((module) => ({
    default: module.PaymentsHub,
  }));

export const loadReceiptVerificationScreen = () =>
  import("./features/payments/ReceiptVerification").then((module) => ({
    default: module.ReceiptVerificationScreen,
  }));

export const loadMockScoreChart = () => import("./components/MockScoreChart");

export const loadTutorSessionWorkspace = () =>
  import("./components/TutorSessionWorkspace");

export const PracticeCoach = lazy(loadPracticeCoach);
export const PracticeBankAdmin = lazy(loadPracticeBankAdmin);
export const PaymentsHub = lazy(loadPaymentsHub);
export const ReceiptVerificationScreen = lazy(loadReceiptVerificationScreen);
export const MockScoreChart = lazy(loadMockScoreChart);
export const TutorSessionWorkspace = lazy(loadTutorSessionWorkspace);

type IdleScheduler = Pick<typeof globalThis, "setTimeout"> & {
  requestIdleCallback?: typeof globalThis.requestIdleCallback;
};

/**
 * Fetch the given chunks once the shell has painted so nobody waits on them
 * later. Uses idle time when the browser offers it, otherwise a short timer,
 * and loads the chunks one after another so they never compete with each
 * other or with the first data fetch. Failures are ignored: the real
 * navigation will retry the import.
 */
export function warmUpViews(
  loads: readonly (() => Promise<unknown>)[],
  scheduler: IdleScheduler = globalThis,
): void {
  const run = () => {
    // The first import starts at once; each later one waits for the previous.
    void loads.reduce<Promise<unknown> | null>(
      (chain, load) => (chain ? chain.then(() => load()) : load()).catch(() => undefined),
      null,
    );
  };
  if (typeof scheduler.requestIdleCallback === "function") {
    scheduler.requestIdleCallback(run, { timeout: 4000 });
    return;
  }
  scheduler.setTimeout(run, 1500);
}

/** The student's hot path: practice first; the chart follows for Mock Results. */
export function warmUpPracticeView(
  scheduler: IdleScheduler = globalThis,
  load: () => Promise<unknown> = loadPracticeCoach,
): void {
  warmUpViews([load], scheduler);
}

/** Tutor accounts also open Session Mode and the score chart most days. */
export function warmUpTutorViews(scheduler: IdleScheduler = globalThis): void {
  warmUpViews([loadPracticeCoach, loadTutorSessionWorkspace, loadMockScoreChart], scheduler);
}
