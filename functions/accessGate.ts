const COOKIE_NAME = "__Host-mastery_access";
const LOGIN_PATH = "/__access/login";
const LOGOUT_PATH = "/__access/logout";
const SESSION_SECONDS = 12 * 60 * 60;

export interface AccessGateEnv {
  GATE_TUTOR_PASSWORD?: string;
  GATE_STUDENT_PASSWORD?: string;
  GATE_SESSION_SECRET?: string;
}

export interface AccessGateContext {
  request: Request;
  env: AccessGateEnv;
  next(): Promise<Response>;
}

interface SessionPayload {
  version: 1;
  account: "tutor" | "student";
  expiresAt: number;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/u, "");
}

function base64UrlDecode(value: string): Uint8Array<ArrayBuffer> | null {
  try {
    const normalized = value.replaceAll("-", "+").replaceAll("_", "/");
    const padded = normalized.padEnd(
      normalized.length + ((4 - (normalized.length % 4)) % 4),
      "=",
    );
    return Uint8Array.from(atob(padded), (character) =>
      character.charCodeAt(0),
    );
  } catch {
    return null;
  }
}

async function importSigningKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { hash: "SHA-256", name: "HMAC" },
    false,
    ["sign", "verify"],
  );
}

async function signPayload(payload: SessionPayload, secret: string) {
  const encodedPayload = base64UrlEncode(
    encoder.encode(JSON.stringify(payload)),
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    await importSigningKey(secret),
    encoder.encode(encodedPayload),
  );
  return `${encodedPayload}.${base64UrlEncode(new Uint8Array(signature))}`;
}

async function verifyToken(
  token: string,
  secret: string,
): Promise<SessionPayload | null> {
  const [encodedPayload, encodedSignature, extra] = token.split(".");
  if (!encodedPayload || !encodedSignature || extra) return null;

  const signature = base64UrlDecode(encodedSignature);
  const payloadBytes = base64UrlDecode(encodedPayload);
  if (!signature || !payloadBytes) return null;

  const validSignature = await crypto.subtle.verify(
    "HMAC",
    await importSigningKey(secret),
    signature,
    encoder.encode(encodedPayload),
  );
  if (!validSignature) return null;

  try {
    const payload = JSON.parse(decoder.decode(payloadBytes)) as SessionPayload;
    if (
      payload.version !== 1 ||
      (payload.account !== "tutor" && payload.account !== "student") ||
      !Number.isFinite(payload.expiresAt) ||
      payload.expiresAt <= Math.floor(Date.now() / 1000)
    ) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

async function secretsMatch(provided: string, expected: string) {
  const [providedHash, expectedHash] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(provided)),
    crypto.subtle.digest("SHA-256", encoder.encode(expected)),
  ]);
  const left = new Uint8Array(providedHash);
  const right = new Uint8Array(expectedHash);
  let difference = left.length ^ right.length;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left[index] ^ right[index];
  }
  return difference === 0;
}

function cookieValue(request: Request): string | null {
  const header = request.headers.get("Cookie") ?? "";
  for (const part of header.split(";")) {
    const [name, ...value] = part.trim().split("=");
    if (name === COOKIE_NAME) return value.join("=");
  }
  return null;
}

function safeReturnPath(value: FormDataEntryValue | string | null): string {
  if (
    typeof value !== "string" ||
    !value.startsWith("/") ||
    value.startsWith("//")
  ) {
    return "/";
  }
  return value;
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function privateHeaders(contentType = "text/html; charset=UTF-8") {
  return {
    "Cache-Control": "no-store, private",
    "Content-Security-Policy":
      "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
    "Content-Type": contentType,
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
  };
}

function loginPage(returnTo: string, invalid = false) {
  const error = invalid
    ? '<p class="error" role="alert">That account or password was not recognized.</p>'
    : "";
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="robots" content="noindex,nofollow,noarchive">
  <title>Private access · Mastery Path</title>
  <style>
    :root { color-scheme: dark; font-family: Inter, ui-sans-serif, system-ui, sans-serif; }
    * { box-sizing: border-box; }
    body { margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 24px; color: #eff6ff; background: radial-gradient(circle at top right, #173b5a, #071426 55%); }
    main { width: min(100%, 460px); padding: 40px; border: 1px solid #31506d; border-radius: 24px; background: #10243a; box-shadow: 0 28px 80px #02081799; }
    .mark { display: grid; place-items: center; width: 52px; height: 52px; margin-bottom: 28px; border-radius: 15px; color: #071426; background: #77e1cf; font-size: 26px; font-weight: 800; }
    .eyebrow { margin: 0 0 8px; color: #8ddfd2; font-size: 13px; font-weight: 800; letter-spacing: .12em; text-transform: uppercase; }
    h1 { margin: 0 0 12px; font-size: clamp(30px, 7vw, 42px); line-height: 1.04; }
    .intro { margin: 0 0 30px; color: #bfd0e2; line-height: 1.6; }
    label { display: block; margin: 18px 0 8px; color: #dbeafe; font-weight: 700; }
    select, input { width: 100%; min-height: 50px; padding: 12px 14px; border: 1px solid #466681; border-radius: 11px; color: #fff; background: #091a2d; font: inherit; }
    select:focus, input:focus { outline: 3px solid #64d9c755; border-color: #77e1cf; }
    button { width: 100%; min-height: 52px; margin-top: 24px; border: 0; border-radius: 12px; color: #062033; background: #77e1cf; font: inherit; font-weight: 850; cursor: pointer; }
    button:hover { background: #99eadc; }
    .error { padding: 12px 14px; border: 1px solid #f59e7b; border-radius: 10px; color: #fee2d5; background: #6f281f55; }
    .note { margin: 22px 0 0; padding-top: 18px; border-top: 1px solid #2d4963; color: #8fa8bf; font-size: 13px; line-height: 1.5; }
  </style>
</head>
<body>
  <main>
    <div class="mark" aria-hidden="true">◎</div>
    <p class="eyebrow">Hamad CFA Mastery Path</p>
    <h1>Private access</h1>
    <p class="intro">Enter your private access password. You will then sign in to the tracker normally.</p>
    ${error}
    <form method="post" action="${LOGIN_PATH}">
      <input type="hidden" name="returnTo" value="${escapeHtml(returnTo)}">
      <label for="account">Account</label>
      <select id="account" name="account" required>
        <option value="student">Student</option>
        <option value="tutor">Tutor</option>
      </select>
      <label for="password">Access password</label>
      <input id="password" name="password" type="password" autocomplete="current-password" required autofocus>
      <button type="submit">Continue securely</button>
    </form>
    <p class="note">This private gateway is separate from the tracker sign-in and does not store your Firebase password.</p>
  </main>
</body>
</html>`;
}

function configurationError() {
  return new Response(
    "Private access is not configured. The site owner must add the required encrypted Cloudflare secrets.",
    { status: 503, headers: privateHeaders("text/plain; charset=UTF-8") },
  );
}

function validConfiguration(env: AccessGateEnv) {
  return (
    (env.GATE_TUTOR_PASSWORD?.length ?? 0) >= 16 &&
    (env.GATE_STUDENT_PASSWORD?.length ?? 0) >= 16 &&
    (env.GATE_SESSION_SECRET?.length ?? 0) >= 32
  );
}

export async function handleAccessGate(
  context: AccessGateContext,
): Promise<Response> {
  const { env, request } = context;
  if (!validConfiguration(env)) return configurationError();

  const url = new URL(request.url);
  if (url.pathname === LOGOUT_PATH) {
    return new Response(null, {
      status: 303,
      headers: {
        Location: LOGIN_PATH,
        "Set-Cookie": `${COOKIE_NAME}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict`,
        ...privateHeaders(),
      },
    });
  }

  if (url.pathname === LOGIN_PATH && request.method === "POST") {
    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      return new Response(loginPage("/", true), {
        status: 400,
        headers: privateHeaders(),
      });
    }

    const account = form.get("account");
    const password = form.get("password");
    const returnTo = safeReturnPath(form.get("returnTo"));
    const validAccount =
      account === "tutor" || account === "student" ? account : null;
    const expectedPassword =
      validAccount === "tutor"
        ? env.GATE_TUTOR_PASSWORD!
        : validAccount === "student"
          ? env.GATE_STUDENT_PASSWORD!
          : "";

    if (
      typeof password !== "string" ||
      !validAccount ||
      !expectedPassword ||
      !(await secretsMatch(password, expectedPassword))
    ) {
      return new Response(loginPage(returnTo, true), {
        status: 401,
        headers: privateHeaders(),
      });
    }

    const token = await signPayload(
      {
        version: 1,
        account: validAccount,
        expiresAt: Math.floor(Date.now() / 1000) + SESSION_SECONDS,
      },
      env.GATE_SESSION_SECRET!,
    );
    return new Response(null, {
      status: 303,
      headers: {
        Location: returnTo,
        "Set-Cookie": `${COOKIE_NAME}=${token}; Path=/; Max-Age=${SESSION_SECONDS}; HttpOnly; Secure; SameSite=Strict`,
        ...privateHeaders(),
      },
    });
  }

  const token = cookieValue(request);
  if (token && (await verifyToken(token, env.GATE_SESSION_SECRET!))) {
    return context.next();
  }

  const returnTo = safeReturnPath(`${url.pathname}${url.search}`);
  return new Response(loginPage(returnTo), {
    status: 401,
    headers: privateHeaders(),
  });
}
