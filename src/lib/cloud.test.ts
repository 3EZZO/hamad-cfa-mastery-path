import { afterEach, describe, expect, it, vi } from "vitest";
import type { TrackerState } from "../types";
import {
  getCloudConfigurationStatus,
  mapCloudError,
  parseCloudEnvelope,
  parsePrivateTutorNotesEnvelope,
  parseProjectMember,
} from "./cloud";

function state(): TrackerState {
  return {
    version: 1,
    scheduleVersion: "weekly-saturday-v1",
    updatedAt: "2026-08-03T00:00:00.000Z",
  taskCompletions: {},
  sessionCompletionRequests: {},
  sessionCompletionReviews: {},
    topicMastery: {},
    sessionLogs: [],
    practiceLogs: [],
    mockScores: [],
    errorEntries: [],
    notes: [],
    sessionOverrides: {},
    diagnostics: [],
  };
}

afterEach(() => vi.unstubAllEnvs());

describe("Firebase client configuration", () => {
  it("reports every missing required web value", () => {
    vi.stubEnv("VITE_FIREBASE_API_KEY", "");
    vi.stubEnv("VITE_FIREBASE_AUTH_DOMAIN", "");
    vi.stubEnv("VITE_FIREBASE_PROJECT_ID", "");
    vi.stubEnv("VITE_FIREBASE_APP_ID", "");

    const status = getCloudConfigurationStatus();
    expect(status.configured).toBe(false);
    expect(status.missingKeys).toHaveLength(4);
  });

  it("accepts the four public Firebase web values", () => {
    vi.stubEnv("VITE_FIREBASE_API_KEY", "public-api-key");
    vi.stubEnv("VITE_FIREBASE_AUTH_DOMAIN", "example.firebaseapp.com");
    vi.stubEnv("VITE_FIREBASE_PROJECT_ID", "project-202-test");
    vi.stubEnv("VITE_FIREBASE_APP_ID", "1:123:web:abc");

    expect(getCloudConfigurationStatus()).toMatchObject({
      configured: true,
      missingKeys: [],
    });
  });
});

describe("cloud envelope validation", () => {
  it("normalizes a valid revision envelope", () => {
    const envelope = parseCloudEnvelope({
      state: state(),
      revision: 4,
      updatedBy: "member-uid",
      updatedAtClient: "2026-08-03T01:00:00.000Z",
    });

    expect(envelope.revision).toBe(4);
    expect(envelope.state.version).toBe(1);
  });

  it("rejects invalid revisions and payloads", () => {
    expect(() =>
      parseCloudEnvelope({
        state: state(),
        revision: 0,
        updatedBy: "member-uid",
        updatedAtClient: "2026-08-03T01:00:00.000Z",
      }),
    ).toThrow(/valid Hamad CFA Mastery tracker/i);
  });
});

describe("private tutor note envelope validation", () => {
  it("normalizes the separate tutor-only payload", () => {
    const envelope = parsePrivateTutorNotesEnvelope({
      notes: [{
        id: "private-1",
        date: "2026-08-20",
        category: "Shared tutor note",
        title: "Coaching observation",
        body: "Tutor only",
        updatedAt: "2026-08-20T10:00:00.000Z",
      }],
      revision: 1,
      updatedBy: "tutor-uid",
      updatedAtClient: "2026-08-20T10:00:00.000Z",
    });
    expect(envelope.notes[0]?.title).toBe("Coaching observation");
  });
});

describe("Hamad CFA Mastery member validation", () => {
  it("accepts active tutor and student membership records", () => {
    expect(
      parseProjectMember("tutor-uid", { active: true, role: "tutor" }),
    ).toEqual({ uid: "tutor-uid", active: true, role: "tutor" });
    expect(
      parseProjectMember("student-uid", { active: false, role: "student" }),
    ).toEqual({ uid: "student-uid", active: false, role: "student" });
  });

  it("rejects malformed or elevated membership roles", () => {
    expect(() =>
      parseProjectMember("uid", { active: true, role: "admin" }),
    ).toThrow(/membership record is invalid/i);
    expect(() => parseProjectMember("uid", { role: "tutor" })).toThrow(
      /membership record is invalid/i,
    );
  });
});

describe("cloud error messages", () => {
  it("maps permissions, credentials, and network errors for the UI", () => {
    expect(mapCloudError({ code: "firestore/permission-denied" }).code).toBe(
      "permission-denied",
    );
    expect(mapCloudError({ code: "auth/wrong-password" }).code).toBe(
      "invalid-credentials",
    );
    expect(mapCloudError({ code: "auth/network-request-failed" }).code).toBe(
      "network-unavailable",
    );
  });
});
