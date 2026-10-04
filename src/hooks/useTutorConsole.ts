import { useCallback, useEffect, useState } from "react";
import type { MockReminder } from "../lib/mockReminders";
import type { MockAttempt, MockTestMeta } from "../lib/mockTestContent";
import type { PaymentConfig, PaymentRecord } from "../lib/cloudPayments";
import type { PublishedPracticeBank } from "../lib/practiceContent";

/**
 * Everything Tutor Admin's overview, badges and quick find read, loaded once
 * for the page (tutor only). Each part degrades on its own: a failed read
 * leaves that part null instead of blanking the console. `refresh()` reloads
 * after an action; the cloud modules load on demand so they stay out of the
 * shell's first paint.
 */
export interface TutorConsoleData {
  loading: boolean;
  studentUid: string | null;
  metas: MockTestMeta[] | null;
  attempts: MockAttempt[] | null;
  reminders: MockReminder[] | null;
  banks: PublishedPracticeBank[] | null;
  assignedBankIds: string[] | null;
  payments: { config: PaymentConfig | null; records: PaymentRecord[] } | null;
}

const EMPTY: TutorConsoleData = {
  loading: true,
  studentUid: null,
  metas: null,
  attempts: null,
  reminders: null,
  banks: null,
  assignedBankIds: null,
  payments: null,
};

const settle = <T,>(promise: Promise<T>): Promise<T | null> => promise.catch(() => null);

async function loadConsole(): Promise<TutorConsoleData> {
  const [cloud, mocks, reminders, payments] = await Promise.all([
    import("../lib/cloud"),
    import("../lib/cloudMockTests"),
    import("../lib/cloudMockReminders"),
    import("../lib/cloudPayments"),
  ]);
  const students = await settle(cloud.listActiveStudentMembers());
  const studentUid = students?.[0]?.uid ?? null;
  const [metas, attempts, reminderList, banks, assignment, config, records] = await Promise.all([
    settle(mocks.listMockTestMetas()),
    settle(mocks.listMockAttempts()),
    settle(reminders.listMockReminders()),
    settle(cloud.listPublishedPracticeBanks()),
    settle(cloud.loadPracticeAssignment()),
    studentUid ? settle(payments.getPaymentConfig(studentUid)) : Promise.resolve(null),
    studentUid ? settle(payments.listPaymentRecords(studentUid)) : Promise.resolve(null),
  ]);
  return {
    loading: false,
    studentUid,
    metas,
    attempts,
    reminders: reminderList,
    banks,
    assignedBankIds: assignment === null && banks !== null ? [] : assignment?.bankStorageIds ?? null,
    payments: studentUid && records !== null ? { config, records } : null,
  };
}

export function useTutorConsole(): TutorConsoleData & { refresh: () => void } {
  const [data, setData] = useState<TutorConsoleData>(EMPTY);
  const [generation, setGeneration] = useState(0);

  useEffect(() => {
    let active = true;
    loadConsole()
      .catch((): TutorConsoleData => ({ ...EMPTY, loading: false }))
      .then((next) => { if (active) setData(next); });
    return () => { active = false; };
  }, [generation]);

  const refresh = useCallback(() => setGeneration((value) => value + 1), []);
  return { ...data, refresh };
}
