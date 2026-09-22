// Updates wait for the app to ask: a new worker installs alongside the old
// one and takes over only after the "Update ready" toast reloads the page,
// so an open tab never has its chunks swapped out from under it.
// Tutor playbooks and progress remain in their separate data stores.
//
// The build stamps BUILD_VERSION (scripts/precacheManifest.mjs) and writes
// precache-manifest.json listing every shell file, hashed chunk, font and
// icon. The cache name follows the version, so nothing here is edited by
// hand between releases; a source checkout keeps the placeholder.
const BUILD_VERSION = "__BUILD_VERSION__";
const VERSION = `hamad-mastery-pwa-${BUILD_VERSION.startsWith("__") ? "dev" : BUILD_VERSION}`;
const PRECACHE_MANIFEST = "precache-manifest.json";
const APP_SCOPE = new URL(self.registration.scope);
const APP_BASE = APP_SCOPE.pathname.endsWith("/")
  ? APP_SCOPE.pathname
  : `${APP_SCOPE.pathname}/`;
const APP_SHELL = [
  APP_BASE,
  `${APP_BASE}index.html`,
  `${APP_BASE}manifest.webmanifest`,
  `${APP_BASE}project-202-mark.svg`,
  `${APP_BASE}icons/project-202-192.png`,
  `${APP_BASE}icons/project-202-512.png`,
  `${APP_BASE}icons/project-202-maskable-192.png`,
  `${APP_BASE}icons/project-202-maskable-512.png`,
  `${APP_BASE}icons/project-202-apple-touch.png`,
];

async function precacheFromManifest(cache) {
  const response = await fetch(`${APP_BASE}${PRECACHE_MANIFEST}`, { cache: "no-store" });
  if (!response.ok) throw new Error(`manifest ${response.status}`);
  const manifest = await response.json();
  if (!manifest || !Array.isArray(manifest.files) || !manifest.files.length) {
    throw new Error("manifest has no files");
  }
  const urls = manifest.files.map((file) => `${APP_BASE}${file}`);
  // Every listed file is part of this release; a single failure fails the
  // install so the old worker keeps serving until the next attempt.
  await cache.addAll([APP_BASE, ...urls]);
  await cache.put(`${APP_BASE}${PRECACHE_MANIFEST}`, new Response(JSON.stringify(manifest), {
    headers: { "content-type": "application/json" },
  }));
}

async function installAppShell() {
  const cache = await caches.open(VERSION);
  try {
    await precacheFromManifest(cache);
    return;
  } catch {
    // No manifest (older deploy or preview server): fall back to the shell
    // list plus whatever index.html references directly.
  }
  await cache.addAll(APP_SHELL);

  const indexResponse =
    (await cache.match(`${APP_BASE}index.html`)) ||
    (await cache.match(APP_BASE));
  if (!indexResponse) return;

  const html = await indexResponse.text();
  const discoveredAssets = [...html.matchAll(/(?:src|href)=["']([^"'#]+)["']/gi)]
    .map((match) => new URL(match[1], APP_SCOPE))
    .filter(
      (url) =>
        url.origin === APP_SCOPE.origin && url.pathname.startsWith(APP_BASE),
    )
    .map((url) => url.href);
  await Promise.allSettled(discoveredAssets.map((url) => cache.add(url)));
}

self.addEventListener("install", (event) => {
  event.waitUntil(installAppShell());
  // The page decides when the new worker takes over (see "message").
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    Promise.all([
      caches
        .keys()
        .then((keys) =>
          Promise.all(keys.filter((key) => key !== VERSION).map((key) => caches.delete(key))),
        ),
      self.clients.claim(),
    ]),
  );
});

function isAppRequest(url) {
  return url.origin === APP_SCOPE.origin && url.pathname.startsWith(APP_BASE);
}

function isNavigation(request) {
  return request.mode === "navigate";
}

async function networkFirstNavigation(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(VERSION);
      cache.put(`${APP_BASE}index.html`, response.clone());
    }
    return response;
  } catch {
    return (
      (await caches.match(`${APP_BASE}index.html`)) ||
      (await caches.match(APP_BASE)) ||
      Response.error()
    );
  }
}

async function cacheFirstAsset(request) {
  // Static hosts and local preview servers may attach `Vary: Origin` to
  // assets. The install-time request and a later module/style request can
  // therefore carry different request headers even though their immutable
  // URL is identical. These are same-origin, scope-limited static files, so
  // matching by URL is both safe and necessary for dependable offline loads.
  const cached = await caches.match(request, { ignoreVary: true });
  if (cached) return cached;

  const response = await fetch(request);
  if (response.ok) {
    const cache = await caches.open(VERSION);
    cache.put(request, response.clone());
  }
  return response;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  // Firebase Authentication and Firestore remain network-managed. This worker
  // only handles files under the tracker's current GitHub Pages scope.
  if (!isAppRequest(url)) return;

  if (isNavigation(request)) {
    event.respondWith(networkFirstNavigation(request));
    return;
  }

  // Every non-navigation request below the static Pages scope is part of the
  // app shell. Do not depend on `request.destination`: browsers may leave it
  // empty for module imports, programmatic manifest checks, and other static
  // resources. Cross-origin Firebase traffic is still excluded above.
  event.respondWith(cacheFirstAsset(request));
});
