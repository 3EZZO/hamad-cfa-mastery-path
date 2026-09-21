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
 * Fetch the practice chunk once the shell has painted so the student never
 * waits on it. Uses idle time when the browser offers it, otherwise a short
 * timer. Failures are ignored: the real navigation will retry the import.
 */
export function warmUpPracticeView(
  scheduler: IdleScheduler = globalThis,
  load: () => Promise<unknown> = loadPracticeCoach,
): void {
  const run = () => {
    void load().catch(() => undefined);
  };
  if (typeof scheduler.requestIdleCallback === "function") {
    scheduler.requestIdleCallback(run, { timeout: 4000 });
    return;
  }
  scheduler.setTimeout(run, 1500);
}
