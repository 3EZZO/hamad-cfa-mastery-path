const VERSION = "project-202-pwa-v3";
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

async function installAppShell() {
  const cache = await caches.open(VERSION);
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
  self.skipWaiting();
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
  // only handles files under the Project 202 hosting scope.
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
