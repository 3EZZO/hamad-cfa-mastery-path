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
];

await Promise.all(
  requiredFiles.map((file) => access(`${outputDirectory}/${file}`)),
);

const html = await readFile(`${outputDirectory}/index.html`, "utf8");
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
