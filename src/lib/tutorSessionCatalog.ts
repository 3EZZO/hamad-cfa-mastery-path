import { getSessionTaskId, getSessionTopic, getWeekSessions, PLAN } from "../data/plan";
import { verifyTutorPlaybookPackageIntegrity } from "./tutorContent";

export const TUTOR_SESSION_NUMBERS = [1, 2, 3, 4] as const;
export type TutorSessionNumber = (typeof TUTOR_SESSION_NUMBERS)[number];

export function getTutorSession(number: TutorSessionNumber) {
  const week = PLAN.find(item =>
    getWeekSessions(item).some(session => session.number === number)
  );
  const session =
    week && getWeekSessions(week).find(item => item.number === number);
  if (!week || !session)
    throw new Error(`Session ${number} is missing from the study plan.`);
  const label = `Session ${String(number).padStart(2, "0")}`;
  const playbookId = `hamad-cfa-mastery-session-${String(number).padStart(2, "0")}`;
  return {
    number,
    label,
    playbookId,
    week,
    session,
    topic: getSessionTopic(week),
    taskId: getSessionTaskId(week, session),
    // This S1 identifier predates the reschedule. Never rename persisted runs.
    runIdBase: number === 1 ? `${playbookId}-2026-09-05` : playbookId,
  };
}

export function tutorSessionRunId(
  number: TutorSessionNumber,
  version: string,
  hash: string
) {
  return `${getTutorSession(number).runIdBase}-${version}-${hash.slice(0, 12)}`;
}

/** Validate both identity and integrity before any private cloud write. */
export async function validateSessionImport(
  value: unknown,
  number: TutorSessionNumber
) {
  const expected = getTutorSession(number);
  const draft = await verifyTutorPlaybookPackageIntegrity(value);
  if (
    draft.manifest.id !== expected.playbookId ||
    draft.manifest.sessionNumber !== number
  ) {
    throw new Error(
      `Choose the ${expected.label} private playbook JSON. No content was changed.`
    );
  }
  return draft;
}
