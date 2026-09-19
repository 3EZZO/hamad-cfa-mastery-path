import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  handleAccessGate,
  type AccessGateContext,
  type AccessGateEnv,
} from "./accessGate";

const env: AccessGateEnv = {
  GATE_TUTOR_PASSWORD: "tutor-password-at-least-16",
  GATE_STUDENT_PASSWORD: "student-password-at-least-16",
  GATE_SESSION_SECRET: "a-session-signing-secret-that-is-long-enough",
};

function context(request: Request, overrides: AccessGateEnv = {}) {
  return {
    request,
    env: { ...env, ...overrides },
    next: vi.fn(async () => new Response("private tracker")),
  } satisfies AccessGateContext;
}

function loginRequest(account: string, password: string, returnTo = "/") {
  return new Request("https://tracker.example/__access/login", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ account, password, returnTo }),
  });
}

describe("Cloudflare Pages private access gate", () => {
  beforeEach(() => vi.useRealTimers());

  it("fails closed when encrypted secrets are missing", async () => {
    const testContext = context(new Request("https://tracker.example/"), {
      GATE_SESSION_SECRET: "",
    });
    const response = await handleAccessGate(testContext);

    expect(response.status).toBe(503);
    expect(testContext.next).not.toHaveBeenCalled();
  });

  it("shows a private login page to an unauthenticated visitor", async () => {
    const testContext = context(
      new Request("https://tracker.example/practice?module=ethics"),
    );
    const response = await handleAccessGate(testContext);

    expect(response.status).toBe(401);
    expect(await response.text()).toContain("Private access");
    expect(testContext.next).not.toHaveBeenCalled();
  });

  it("rejects an incorrect password without creating a session", async () => {
    const response = await handleAccessGate(
      context(loginRequest("student", "incorrect-password")),
    );

    expect(response.status).toBe(401);
    expect(response.headers.get("Set-Cookie")).toBeNull();
  });

  it.each([
    ["student", env.GATE_STUDENT_PASSWORD!],
    ["tutor", env.GATE_TUTOR_PASSWORD!],
  ])(
    "creates a secure session for the %s account",
    async (account, password) => {
      const response = await handleAccessGate(
        context(loginRequest(account, password, "/practice")),
      );

      expect(response.status).toBe(303);
      expect(response.headers.get("Location")).toBe("/practice");
      expect(response.headers.get("Set-Cookie")).toContain(
        "HttpOnly; Secure; SameSite=Strict",
      );
    },
  );

  it("accepts a valid signed session and rejects a tampered session", async () => {
    const login = await handleAccessGate(
      context(loginRequest("tutor", env.GATE_TUTOR_PASSWORD!)),
    );
    const cookie = login.headers.get("Set-Cookie")!.split(";", 1)[0];
    const authenticated = context(
      new Request("https://tracker.example/", { headers: { Cookie: cookie } }),
    );

    expect((await handleAccessGate(authenticated)).status).toBe(200);
    expect(authenticated.next).toHaveBeenCalledOnce();

    const tampered = context(
      new Request("https://tracker.example/", {
        headers: { Cookie: `${cookie}tampered` },
      }),
    );
    expect((await handleAccessGate(tampered)).status).toBe(401);
    expect(tampered.next).not.toHaveBeenCalled();
  });

  it("rejects expired sessions", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-20T00:00:00Z"));
    const login = await handleAccessGate(
      context(loginRequest("student", env.GATE_STUDENT_PASSWORD!)),
    );
    const cookie = login.headers.get("Set-Cookie")!.split(";", 1)[0];
    vi.setSystemTime(new Date("2026-09-21T00:00:00Z"));

    const expired = context(
      new Request("https://tracker.example/", { headers: { Cookie: cookie } }),
    );
    expect((await handleAccessGate(expired)).status).toBe(401);
  });

  it("prevents external redirect destinations", async () => {
    const response = await handleAccessGate(
      context(
        loginRequest(
          "student",
          env.GATE_STUDENT_PASSWORD!,
          "//malicious.example/path",
        ),
      ),
    );

    expect(response.headers.get("Location")).toBe("/");
  });
});
