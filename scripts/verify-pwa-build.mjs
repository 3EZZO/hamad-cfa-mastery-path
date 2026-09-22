import { access, readFile } from "node:fs/promises";

const outputDirectory = process.env.PWA_OUTPUT_DIR || "dist-pages";
const requiredFiles = [
  "index.html",
  "manifest.webmanifest",
  "service-worker.js",
  "project-202-mark.svg",
  "icons/project-202-192.png",
  "icons/project-202-512.png",
  "icons/project-202-maskable-192.png",
  "icons/project-202-maskable-512.png",
  "icons/project-202-apple-touch.png",
  "fonts/sora-100-800-latin.woff2",
  "fonts/ibm-plex-sans-400-700-latin.woff2",
  "fonts/ibm-plex-mono-500-latin.woff2",
  "fonts/ibm-plex-mono-600-latin.woff2",
];

await Promise.all(
  requiredFiles.map((file) => access(`${outputDirectory}/${file}`)),
);

const html = await readFile(`${outputDirectory}/index.html`, "utf8");
if (/fonts\.googleapis\.com|fonts\.gstatic\.com/i.test(html)) {
  throw new Error("Built index.html still references Google Fonts; fonts must be self-hosted.");
}
if (!/<link[^>]+rel=["']preload["'][^>]+as=["']font["']/i.test(html)) {
  throw new Error("Built index.html does not preload the self-hosted body font.");
}
if (!/<link[^>]+rel=["']manifest["']/i.test(html)) {
  throw new Error("Built index.html does not link the web app manifest.");
}
if (!/<link[^>]+rel=["']apple-touch-icon["']/i.test(html)) {
  throw new Error("Built index.html does not link the Apple touch icon.");
}

const manifest = JSON.parse(
  await readFile(`${outputDirectory}/manifest.webmanifest`, "utf8"),
);
if (
  manifest.display !== "standalone" ||
  manifest.start_url !== "./" ||
  manifest.scope !== "./" ||
  !Array.isArray(manifest.icons) ||
  !manifest.icons.some((icon) => icon.sizes === "192x192") ||
  !manifest.icons.some((icon) => icon.sizes === "512x512") ||
  !manifest.icons.some((icon) => String(icon.purpose).includes("maskable"))
) {
  throw new Error("Web app manifest is missing an installability requirement.");
}

const serviceWorker = await readFile(
  `${outputDirectory}/service-worker.js`,
  "utf8",
);
if (!serviceWorker.includes('self.addEventListener("fetch"')) {
  throw new Error("Built service worker does not define an offline fetch handler.");
}

console.log(
  `PWA artifact verified in ${outputDirectory}: manifest, service worker, branded icons, and install metadata are present.`,
);

// Precache manifest: present, versioned, covering every hashed asset, and the
// worker must carry the same version instead of the source placeholder.
const precache = JSON.parse(
  await readFile(`${outputDirectory}/precache-manifest.json`, "utf8"),
);
if (!/^[0-9a-f]{16}$/.test(String(precache.version)) || !Array.isArray(precache.files)) {
  throw new Error("precache-manifest.json is missing a version or file list.");
}
const { readdir } = await import("node:fs/promises");
const assetFiles = (await readdir(`${outputDirectory}/assets`)).map((file) => `assets/${file}`);
const missingAssets = assetFiles.filter((file) => !precache.files.includes(file));
if (missingAssets.length) {
  throw new Error(`precache-manifest.json does not list: ${missingAssets.join(", ")}`);
}
for (const file of precache.files) await access(`${outputDirectory}/${file}`);
if (serviceWorker.includes("__BUILD_VERSION__") || !serviceWorker.includes(precache.version)) {
  throw new Error("Built service worker is not stamped with the precache manifest version.");
}
console.log(`Precache manifest verified: ${precache.files.length} files, version ${precache.version} stamped into the worker.`);
