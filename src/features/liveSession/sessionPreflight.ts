import type {
  LiveSessionCloudAccess,
  LiveSessionPlaybook,
  LiveSessionStage,
  SyncPresentation,
} from "./types";

export const SESSION_PREFLIGHT_DECK_TARGET = 120;

export type SessionPreflightCheckId =
  | "tutor-access"
  | "playbook"
  | "offline-recovery"
  | "sync-health"
  | "timer"
  | "calculator"
  | "position";

export type SessionPreflightCheckStatus =
  "ready" | "checking" | "warning" | "blocked";

export type TutorCloudAccess = LiveSessionCloudAccess;

export interface SessionPreflightPositionInput {
  routeId: string | null;
  stageIndex: number;
  questionIndex: number;
}

export interface SessionPreflightInput {
  authReady: boolean;
  userUid: string | null;
  membershipReady: boolean;
  memberActive: boolean;
  role: "tutor" | "student" | null;
  cloudAccess: TutorCloudAccess;
  playbook: LiveSessionPlaybook | null;
  expectedDeckCount?: number;
  offlineReady: boolean;
  syncState: SyncPresentation;
  timerReady: boolean;
  calculatorReady: boolean;
  position: SessionPreflightPositionInput;
}

export interface SessionPreflightCheck {
  id: SessionPreflightCheckId;
  label: string;
  detail: string;
  status: SessionPreflightCheckStatus;
  blocksStart: boolean;
}

export interface ResolvedSessionPosition {
  routeId: string;
  stageId: string;
  stageTitle: string;
  cardId: string;
  deckNumber: number;
  deckCount: number;
}

export interface SessionPreflightReport {
  checks: SessionPreflightCheck[];
  canStart: boolean;
  readyCount: number;
  warningCount: number;
  blockingCount: number;
  position: ResolvedSessionPosition | null;
}

function check(
  id: SessionPreflightCheckId,
  label: string,
  detail: string,
  status: SessionPreflightCheckStatus
): SessionPreflightCheck {
  return {
    id,
    label,
    detail,
    status,
    blocksStart: status === "blocked" || status === "checking",
  };
}

function routeStages(
  playbook: LiveSessionPlaybook,
  routeId: string
): LiveSessionStage[] {
  return playbook.stagesByRoute[routeId] ?? [];
}

export function countSessionPlaybookDecks(
  playbook: LiveSessionPlaybook | null
): number {
  if (!playbook) return 0;
  return Math.max(
    0,
    ...playbook.routes.map(route =>
      routeStages(playbook, route.id).reduce(
        (total, stage) => total + (stage.questions?.length ?? 0),
        0
      )
    )
  );
}

export function countSessionRouteDecks(
  playbook: LiveSessionPlaybook | null,
  routeId: string | null
): number {
  if (!playbook || !routeId) return 0;
  if (!playbook.routes.some(route => route.id === routeId)) return 0;
  return routeStages(playbook, routeId).reduce(
    (total, stage) => total + (stage.questions?.length ?? 0),
    0
  );
}

export function resolveSessionPreflightPosition(
  playbook: LiveSessionPlaybook | null,
  position: SessionPreflightPositionInput
): ResolvedSessionPosition | null {
  if (!playbook || !position.routeId) return null;
  if (
    !Number.isInteger(position.stageIndex) ||
    !Number.isInteger(position.questionIndex) ||
    position.stageIndex < 0 ||
    position.questionIndex < 0
  ) {
    return null;
  }

  const route = playbook.routes.find(
    candidate => candidate.id === position.routeId
  );
  if (!route) return null;
  const stages = routeStages(playbook, route.id);
  const stage = stages[position.stageIndex];
  const card = stage?.questions?.[position.questionIndex];
  if (!stage || !card) return null;

  const priorDecks = stages
    .slice(0, position.stageIndex)
    .reduce(
      (total, candidate) => total + (candidate.questions?.length ?? 0),
      0
    );
  return {
    routeId: route.id,
    stageId: stage.id,
    stageTitle: stage.title,
    cardId: card.id,
    deckNumber: priorDecks + position.questionIndex + 1,
    deckCount: stages.reduce(
      (total, candidate) => total + (candidate.questions?.length ?? 0),
      0
    ),
  };
}

function tutorAccessCheck(input: SessionPreflightInput): SessionPreflightCheck {
  if (
    !input.authReady ||
    !input.membershipReady ||
    input.cloudAccess === "checking"
  ) {
    return check(
      "tutor-access",
      "Tutor access",
      "Confirming sign-in, membership, and private cloud access.",
      "checking"
    );
  }
  if (!input.userUid) {
    return check(
      "tutor-access",
      "Tutor access",
      "Sign in with Mohamed's tutor account.",
      "blocked"
    );
  }
  if (!input.memberActive) {
    return check(
      "tutor-access",
      "Tutor access",
      "This account does not have an active project membership.",
      "blocked"
    );
  }
  if (input.role !== "tutor") {
    return check(
      "tutor-access",
      "Tutor access",
      "Session Mode requires the active tutor membership.",
      "blocked"
    );
  }
  if (input.cloudAccess === "denied") {
    return check(
      "tutor-access",
      "Tutor access",
      "The tutor account is recognized, but private cloud access was rejected.",
      "blocked"
    );
  }
  if (input.cloudAccess === "unavailable") {
    return check(
      "tutor-access",
      "Tutor access",
      input.offlineReady
        ? "Firebase is temporarily unavailable; verified tutor recovery is ready on this device."
        : "Firebase is unavailable and this device has no verified tutor recovery copy.",
      input.offlineReady ? "warning" : "blocked"
    );
  }
  return check(
    "tutor-access",
    "Tutor access",
    "Active tutor membership and private cloud access confirmed.",
    "ready"
  );
}

function syncHealthCheck(input: SessionPreflightInput): SessionPreflightCheck {
  if (input.syncState === "synced") {
    return check(
      "sync-health",
      "Sync health",
      "Private session state is current in the cloud.",
      "ready"
    );
  }
  if (input.syncState === "saving") {
    return check(
      "sync-health",
      "Sync health",
      "Waiting for the current cloud save to finish.",
      "checking"
    );
  }

  const recoverable = input.offlineReady;
  return check(
    "sync-health",
    "Sync health",
    recoverable
      ? "Cloud sync is unavailable; the verified device recovery copy is ready."
      : "Cloud sync is unavailable and this device has no verified recovery copy.",
    recoverable ? "warning" : "blocked"
  );
}

export function evaluateSessionPreflight(
  input: SessionPreflightInput
): SessionPreflightReport {
  const expectedDeckCount =
    Number.isInteger(input.expectedDeckCount) && input.expectedDeckCount! > 0
      ? input.expectedDeckCount!
      : SESSION_PREFLIGHT_DECK_TARGET;
  const deckCount = countSessionRouteDecks(
    input.playbook,
    input.position.routeId
  );
  const position = resolveSessionPreflightPosition(
    input.playbook,
    input.position
  );

  const checks: SessionPreflightCheck[] = [
    tutorAccessCheck(input),
    deckCount === expectedDeckCount
      ? check(
          "playbook",
          "Private playbook",
          `${deckCount} verified teaching decks are available.`,
          "ready"
        )
      : check(
          "playbook",
          "Private playbook",
          deckCount
            ? `Expected ${expectedDeckCount} decks, but this playbook contains ${deckCount}.`
            : "No usable private teaching decks are available.",
          "blocked"
        ),
    check(
      "offline-recovery",
      "Offline recovery",
      input.offlineReady
        ? "A verified device recovery copy is available."
        : "Prepare an offline copy before leaving for the session.",
      input.offlineReady ? "ready" : "warning"
    ),
    syncHealthCheck(input),
    check(
      "timer",
      "Session timer",
      input.timerReady
        ? "The session timer and candidate view are ready."
        : "Confirm the session timer and candidate view.",
      input.timerReady ? "ready" : "blocked"
    ),
    check(
      "calculator",
      "Calculator",
      input.calculatorReady
        ? "BA II Plus readiness has been confirmed."
        : "Clear the BA II Plus and confirm END mode.",
      input.calculatorReady ? "ready" : "blocked"
    ),
    position
      ? check(
          "position",
          "Current position",
          `${position.stageTitle} · deck ${position.deckNumber} of ${position.deckCount}.`,
          "ready"
        )
      : check(
          "position",
          "Current position",
          "Choose a valid route, stage, and deck before starting.",
          "blocked"
        ),
  ];

  return {
    checks,
    canStart: checks.every(candidate => !candidate.blocksStart),
    readyCount: checks.filter(candidate => candidate.status === "ready").length,
    warningCount: checks.filter(candidate => candidate.status === "warning")
      .length,
    blockingCount: checks.filter(candidate => candidate.blocksStart).length,
    position,
  };
}
