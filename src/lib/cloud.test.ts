import { afterEach, describe, expect, it, vi } from "vitest";
import type { TrackerState } from "../types";
import {
  getCloudConfigurationStatus,
  mapCloudError,
  parseCloudEnvelope,
} from "./cloud";

function state(): TrackerState {
  return {
    version: 1,
    updatedAt: "2026-08-03T00:00:00.000Z",
    taskCompletions: {},
    topicMastery: {},
    sessionLogs: [],
    practiceLogs: [],
    mockScores: [],
    errorEntries: [],
    notes: [],
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
    ).toThrow(/valid Project 202 tracker/i);
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
