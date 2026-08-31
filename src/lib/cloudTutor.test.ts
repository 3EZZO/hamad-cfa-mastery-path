import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const firebaseHarness = vi.hoisted(() => {
  const tutorUser = {
    uid: "tutor-uid",
    email: "tutor@example.com",
    displayName: "Mohamed Ali",
    photoURL: null,
    emailVerified: true,
    providerData: [],
  };
  return {
    tutorUser,
    auth: { currentUser: tutorUser as typeof tutorUser | null },
    documents: new Map<string, unknown>(),
    batchCommits: 0,
    transactionCommits: 0,
    deletes: 0,
  };
});

vi.mock("firebase/app", () => {
  class FirebaseError extends Error {
    readonly code: string;

    constructor(code: string, message = code) {
      super(message);
      this.code = code;
    }
  }
  return {
    FirebaseError,
    getApps: () => [],
    initializeApp: (_options: unknown, name: string) => ({ name }),
  };
});

vi.mock("firebase/auth", () => ({
  GoogleAuthProvider: class {
    setCustomParameters() {}
  },
  getAuth: () => firebaseHarness.auth,
  onAuthStateChanged: () => () => {},
  signInWithEmailAndPassword: vi.fn(),
  signInWithPopup: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock("firebase/firestore", () => {
  const snapshot = (path: string) => ({
    exists: () => firebaseHarness.documents.has(path),
    data: () => structuredClone(firebaseHarness.documents.get(path)),
  });
  return {
    deleteDoc: async (reference: { path: string }) => {
      firebaseHarness.deletes += 1;
      firebaseHarness.documents.delete(reference.path);
    },
    doc: (_firestore: unknown, ...segments: string[]) => ({
      path: segments.join("/"),
    }),
    getDoc: async (reference: { path: string }) => snapshot(reference.path),
    getDocFromServer: async (reference: { path: string }) =>
      snapshot(reference.path),
    getFirestore: () => ({ kind: "fake-firestore" }),
    onSnapshot: () => () => {},
    runTransaction: async (
      _firestore: unknown,
      callback: (transaction: {
        get: (reference: {
          path: string;
        }) => Promise<ReturnType<typeof snapshot>>;
        set: (reference: { path: string }, value: unknown) => void;
      }) => Promise<unknown>
    ) => {
      const staged = new Map<string, unknown>();
      const result = await callback({
        get: async reference => snapshot(reference.path),
        set: (reference, value) =>
          staged.set(reference.path, structuredClone(value)),
      });
      staged.forEach((value, path) =>
        firebaseHarness.documents.set(path, value)
      );
      firebaseHarness.transactionCommits += 1;
      return result;
    },
    writeBatch: () => {
      const staged = new Map<string, unknown>();
      return {
        set: (reference: { path: string }, value: unknown) => {
          staged.set(reference.path, structuredClone(value));
        },
        commit: async () => {
          staged.forEach((value, path) =>
            firebaseHarness.documents.set(path, value)
          );
          firebaseHarness.batchCommits += 1;
        },
      };
    },
  };
});

import {
  deleteTutorLiveRun,
  diagnoseTutorCloudError,
  getTutorLiveRun,
  importTutorPlaybookPackage,
  loadTutorPlaybookPackage,
  probeTutorLiveRunAccess,
  saveTutorLiveRun,
} from "./cloud";
import {
  computeTutorPlaybookChunkContentHash,
  computeTutorPlaybookManifestContentHash,
  parseTutorPlaybookPackageDraft,
  type TutorLiveRunAction,
} from "./tutorContent";

async function validPackage() {
  const parsed = parseTutorPlaybookPackageDraft({
    manifest: {
      schemaVersion: 1,
      id: "session-01",
      sessionNumber: 1,
      title: "Session 01 Quant Tutor Bible",
      version: "s01-v1",
      contentHash: "0".repeat(64),
      defaultRouteId: "standard",
      routes: [
        {
          id: "standard",
          label: "150-minute route",
          totalMinutes: 150,
          stageIds: ["returns"],
        },
      ],
      chunkIds: ["returns-core"],
    },
    chunks: [
      {
        schemaVersion: 1,
        id: "returns-core",
        order: 0,
        kind: "stage",
        title: "Returns core",
        contentHash: "0".repeat(64),
        stages: [
          {
            id: "returns",
            title: "Return measures",
            objective: "Select, calculate, and defend the correct measure.",
            durationMinutesByRoute: { standard: 150 },
            cards: [
              {
                id: "returns-q01",
                kind: "question",
                title: "Geometric return",
                body: "Compounded wealth uses multiplicative growth.",
                say: ["First name the decision."],
                write: ["(1 + R1)(1 + R2)"],
                ask: ["Which mean preserves compound growth?"],
                prompt: "Select the correct return measure.",
                answer: "Use the geometric mean.",
                rationale: "It reproduces terminal wealth.",
                listenFor: ["Compounding"],
                ifWrong: ["Rebuild the wealth relatives."],
                hints: [],
                masteryEvidence: ["Answers a fresh item without help."],
                errorTags: ["D"],
                expectedSeconds: 90,
                difficulty: 3,
              },
            ],
          },
        ],
      },
    ],
  });
  for (const chunk of parsed.chunks) {
    chunk.contentHash = await computeTutorPlaybookChunkContentHash(chunk);
  }
  parsed.manifest.contentHash = await computeTutorPlaybookManifestContentHash(
    parsed.manifest,
    parsed.chunks
  );
  return parsed;
}

function event(
  id: string,
  type: TutorLiveRunAction["type"],
  elapsedSeconds: number,
  extra: Partial<TutorLiveRunAction> = {}
): TutorLiveRunAction {
  return {
    id,
    type,
    elapsedSeconds,
    atClient: new Date(
      Date.parse("2026-09-05T06:00:00.000Z") + elapsedSeconds * 1_000
    ).toISOString(),
    ...extra,
  };
}

function runRequest(expectedRevision: number, action: TutorLiveRunAction) {
  return {
    runId: "session-01-2026-09-05",
    playbookId: "session-01",
    playbookVersion: "s01-v1",
    sessionNumber: 1,
    routeId: "standard",
    expectedRevision,
    action,
  };
}

function closeout() {
  return {
    mastery: [
      {
        stageId: "returns",
        stageTitle: "Return measures",
        decision: "amber" as const,
      },
    ],
    outcome: "Fresh-question selection improved.",
    nextAction: "Retest in 48 hours.",
    homework: "Complete the assigned returns set.",
    delayedRetest: "Two no-help questions.",
    privateTutorNote: "Recheck definition confidence.",
  };
}

beforeEach(() => {
  vi.stubGlobal("window", {});
  firebaseHarness.documents.clear();
  firebaseHarness.batchCommits = 0;
  firebaseHarness.transactionCommits = 0;
  firebaseHarness.deletes = 0;
  firebaseHarness.auth.currentUser = firebaseHarness.tutorUser;
  vi.stubEnv("VITE_FIREBASE_API_KEY", "public-api-key");
  vi.stubEnv("VITE_FIREBASE_AUTH_DOMAIN", "example.firebaseapp.com");
  vi.stubEnv("VITE_FIREBASE_PROJECT_ID", "project-202-test");
  vi.stubEnv("VITE_FIREBASE_APP_ID", "1:123:web:abc");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("tutor-only cloud playbook API", () => {
  it("verifies, chunks, activates, and reconstructs the private package", async () => {
    const source = await validPackage();
    const published = await importTutorPlaybookPackage(source);

    expect(published.manifest).toMatchObject({
      id: "session-01",
      revision: 1,
      publishedBy: "tutor-uid",
    });
    expect(firebaseHarness.batchCommits).toBe(1);
    expect([...firebaseHarness.documents.keys()]).toEqual(
      expect.arrayContaining([
        "programs/project-202/tutorPlaybooks/session-01",
        "programs/project-202/tutorPlaybooks/session-01/chunks/session-01--s01-v1--returns-core",
      ])
    );
    expect(
      [...firebaseHarness.documents.keys()].some(path =>
        path.includes("/tracker/current")
      )
    ).toBe(false);

    const loaded = await loadTutorPlaybookPackage("session-01");
    expect(loaded?.manifest.contentHash).toBe(source.manifest.contentHash);
    expect(loaded?.chunks[0]?.stages[0]?.cards[0]?.answer).toBe(
      "Use the geometric mean."
    );

    const batchCount = firebaseHarness.batchCommits;
    const repeated = await importTutorPlaybookPackage(source);
    expect(repeated.manifest.revision).toBe(1);
    expect(firebaseHarness.batchCommits).toBe(batchCount);
  });

  it("rejects altered content before the first Firestore write", async () => {
    const source = await validPackage();
    source.chunks[0]!.stages[0]!.cards[0]!.answer = "Altered after hashing";

    await expect(importTutorPlaybookPackage(source)).rejects.toMatchObject({
      code: "invalid-tutor-content",
    });
    expect(firebaseHarness.documents.size).toBe(0);
    expect(firebaseHarness.batchCommits).toBe(0);
    expect(firebaseHarness.transactionCommits).toBe(0);
  });
});

describe("tutor-only cloud live-run API", () => {
  it("saves meaningful evidence and closeout actions, reads, then deletes", async () => {
    let run = await saveTutorLiveRun(
      runRequest(0, event("event-01", "start", 0, { stageId: "returns" }))
    );
    run = await saveTutorLiveRun(
      runRequest(
        1,
        event("event-02", "assessment", 180, {
          stageId: "returns",
          cardId: "returns-q01",
          result: "repair",
          confidence: 5,
          errorCodes: ["D", "C"],
          note: "High-confidence method-selection error.",
        })
      )
    );
    run = await saveTutorLiveRun(
      runRequest(
        2,
        event("event-03", "complete", 600, { closeout: closeout() })
      )
    );

    expect(run).toMatchObject({ status: "completed", revision: 3 });
    expect(run.events[1]).toMatchObject({
      result: "repair",
      confidence: 5,
      errorCodes: ["D", "C"],
    });
    expect(run.events[2]?.closeout?.mastery[0]?.decision).toBe("amber");

    const loaded = await getTutorLiveRun("session-01-2026-09-05");
    expect(loaded).toEqual(run);
    await expect(
      probeTutorLiveRunAccess("session-01-2026-09-05")
    ).resolves.toBeUndefined();
    await deleteTutorLiveRun("session-01-2026-09-05");
    expect(firebaseHarness.deletes).toBe(1);
    await expect(getTutorLiveRun("session-01-2026-09-05")).resolves.toBeNull();
  });

  it("maps stale revisions and missing authentication to stable client errors", async () => {
    const started = await saveTutorLiveRun(
      runRequest(0, event("event-01", "start", 0, { stageId: "returns" }))
    );
    expect(started.revision).toBe(1);
    await expect(
      saveTutorLiveRun(runRequest(0, event("event-02", "pause", 10)))
    ).rejects.toMatchObject({ code: "tutor-live-run-conflict" });

    firebaseHarness.auth.currentUser = null;
    await expect(
      getTutorLiveRun("session-01-2026-09-05")
    ).rejects.toMatchObject({ code: "authentication-required" });
  });
});

describe("tutor-only permission diagnosis", () => {
  const denied = { code: "firestore/permission-denied" };
  const membershipPath = "programs/project-202/members/tutor-uid";

  it("identifies missing and inactive membership", async () => {
    await expect(diagnoseTutorCloudError(denied)).resolves.toMatchObject({
      code: "inactive-membership",
    });

    firebaseHarness.documents.set(membershipPath, {
      active: false,
      role: "tutor",
    });
    await expect(diagnoseTutorCloudError(denied)).resolves.toMatchObject({
      code: "inactive-membership",
    });
  });

  it("distinguishes a non-tutor member from an active tutor", async () => {
    firebaseHarness.documents.set(membershipPath, {
      active: true,
      role: "student",
    });
    await expect(diagnoseTutorCloudError(denied)).resolves.toMatchObject({
      code: "tutor-role-required",
    });

    firebaseHarness.documents.set(membershipPath, {
      active: true,
      role: "tutor",
    });
    const diagnosed = await diagnoseTutorCloudError(denied);
    expect(diagnosed).toMatchObject({ code: "firestore-contract-rejected" });
    expect(diagnosed.message).toMatch(
      /rules or write contract may be out of date/i
    );
  });

  it("preserves invalid membership and unrelated cloud errors", async () => {
    firebaseHarness.documents.set(membershipPath, {
      active: true,
      role: "owner",
    });
    await expect(diagnoseTutorCloudError(denied)).resolves.toMatchObject({
      code: "invalid-membership",
    });
    await expect(
      diagnoseTutorCloudError({ code: "firestore/unavailable" })
    ).resolves.toMatchObject({ code: "service-unavailable" });
  });
});
