import { useEffect, useState } from "react";
import {
  listActiveStudentMembers,
  listPracticeRuns,
  listPublishedPracticeBanks,
  loadPracticeAssignment,
  loadPracticeQuestionStates,
} from "../lib/cloud";
import type { PracticeQuestion, PracticeQuestionState, PracticeRun } from "../lib/practiceContent";

/**
 * A read-only view of the student's Practice record for pages outside
 * Practice Coach (Progress, the tutor brief). The student reads this
 * device's cache first (works offline) and falls back to the cloud when the
 * cache is empty; the tutor reads the student's record from the cloud with
 * the same calls Practice Coach makes. Nothing is written.
 */
export interface PracticeSnapshot {
  status: "loading" | "ready" | "unavailable";
  studentUid: string | null;
  questions: PracticeQuestion[];
  states: Record<string, PracticeQuestionState>;
  runs: PracticeRun[];
}

const LOADING: PracticeSnapshot = { status: "loading", studentUid: null, questions: [], states: {}, runs: [] };

function snapshot(
  studentUid: string,
  questions: PracticeQuestion[],
  states: PracticeQuestionState[],
  runs: PracticeRun[],
): PracticeSnapshot {
  return {
    status: "ready",
    studentUid,
    questions,
    states: Object.fromEntries(states.map((state) => [state.questionId, state])),
    runs,
  };
}

async function loadForStudent(uid: string, includeRuns: boolean): Promise<PracticeSnapshot> {
  const { loadCachedPracticeBanks, loadCachedPracticeRuns, loadCachedPracticeStates } = await import("../lib/practiceOffline");
  const [banks, states, runs] = await Promise.all([
    loadCachedPracticeBanks(),
    loadCachedPracticeStates(uid),
    includeRuns ? loadCachedPracticeRuns() : Promise.resolve([] as PracticeRun[]),
  ]);
  if (banks.length) {
    return snapshot(uid, banks.flatMap((bank) => bank.questions), states, runs.filter((run) => run.uid === uid));
  }
  const [cloudBanks, assignment, cloudStates, cloudRuns] = await Promise.all([
    listPublishedPracticeBanks(),
    loadPracticeAssignment(),
    loadPracticeQuestionStates(uid),
    includeRuns ? listPracticeRuns(uid) : Promise.resolve([] as PracticeRun[]),
  ]);
  const assigned = cloudBanks.filter((bank) => assignment?.bankStorageIds.includes(bank.storageId));
  return snapshot(uid, assigned.flatMap((bank) => bank.questions), cloudStates, cloudRuns);
}

async function loadForTutor(includeRuns: boolean): Promise<PracticeSnapshot> {
  const [student] = await listActiveStudentMembers();
  if (!student) return { ...LOADING, status: "unavailable" };
  const [banks, states, runs] = await Promise.all([
    listPublishedPracticeBanks(),
    loadPracticeQuestionStates(student.uid),
    includeRuns ? listPracticeRuns(student.uid) : Promise.resolve([] as PracticeRun[]),
  ]);
  return snapshot(student.uid, banks.flatMap((bank) => bank.questions), states, runs);
}

export function usePracticeSnapshot({
  role,
  uid,
  includeRuns = false,
  enabled = true,
}: {
  role: "tutor" | "student";
  uid: string;
  includeRuns?: boolean;
  enabled?: boolean;
}): PracticeSnapshot {
  const [value, setValue] = useState<PracticeSnapshot>(LOADING);

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    setValue(LOADING);
    (role === "tutor" ? loadForTutor(includeRuns) : loadForStudent(uid, includeRuns))
      .catch((): PracticeSnapshot => ({ ...LOADING, status: "unavailable" }))
      .then((next) => { if (active) setValue(next); });
    return () => { active = false; };
  }, [enabled, includeRuns, role, uid]);

  return value;
}
