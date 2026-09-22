import { access, copyFile } from "node:fs/promises";
import { writePrecacheManifest } from "./precacheManifest.mjs";

const outputDirectory = "dist-pages";
const indexPath = `${outputDirectory}/index.html`;
const fallbackPath = `${outputDirectory}/404.html`;

await access(indexPath);

// Manifest first, so the verifier below can check it and the stamped worker.
const { version, files } = await writePrecacheManifest(outputDirectory);
console.log(`Precache manifest written: version ${version}, ${files.length} files.`);
await import("./verify-pwa-build.mjs");

// Pages has no rewrite configuration. This fallback keeps a future client-side
// route refresh usable while the current tracker remains a single-page app.
await copyFile(indexPath, fallbackPath);

console.log(
  "GitHub Pages artifact verified: static index, PWA shell, and SPA fallback are present.",
);
