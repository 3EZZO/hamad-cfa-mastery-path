import { createHash } from "node:crypto";
import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import { join, posix } from "node:path";

/**
 * Build-time precache manifest for the service worker.
 *
 * Lists every file the installed app needs to open cold offline: the shell
 * files, every hashed asset chunk (including the lazily loaded ones the
 * install-time HTML scan could never see), the self-hosted fonts and the
 * icons. The version is a digest of that list plus index.html, so it
 * changes exactly when the deployed app changes and the worker can use it
 * as its cache name without anyone editing a constant.
 */
export const MANIFEST_FILE = "precache-manifest.json";
export const VERSION_PLACEHOLDER = "__BUILD_VERSION__";

const SHELL_FILES = [
  "index.html",
  "manifest.webmanifest",
  "theme-init.js",
  "project-202-mark.svg",
];

const PRECACHED_DIRECTORIES = ["assets", "fonts", "icons"];

const EXCLUDED = new Set(["404.html", "service-worker.js", MANIFEST_FILE, "fonts/NOTICE.txt"]);

async function listFiles(root, directory) {
  const entries = await readdir(join(root, directory), { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const relative = posix.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await listFiles(root, relative)));
    else if (entry.isFile()) files.push(relative);
  }
  return files;
}

/** Relative paths (POSIX, no leading slash) of everything to precache, sorted. */
export async function collectPrecacheFiles(root) {
  const files = [...SHELL_FILES];
  for (const directory of PRECACHED_DIRECTORIES) {
    try {
      await stat(join(root, directory));
    } catch {
      continue;
    }
    files.push(...(await listFiles(root, directory)));
  }
  const unique = [...new Set(files)].filter((file) => !EXCLUDED.has(file));
  for (const file of unique) await stat(join(root, file)); // every listed file must exist
  return unique.sort();
}

export function manifestVersion(files, indexHtml) {
  return createHash("sha256")
    .update(files.join("\n"))
    .update("\n--\n")
    .update(indexHtml)
    .digest("hex")
    .slice(0, 16);
}

/**
 * Writes `<root>/precache-manifest.json` and stamps the version into the
 * built service worker (replacing the placeholder), so a byte-different
 * worker is deployed whenever the app changes and never when it does not.
 */
export async function writePrecacheManifest(root) {
  const files = await collectPrecacheFiles(root);
  const indexHtml = await readFile(join(root, "index.html"), "utf8");
  const version = manifestVersion(files, indexHtml);
  await writeFile(
    join(root, MANIFEST_FILE),
    JSON.stringify({ version, files }, null, 2) + "\n",
  );
  const workerPath = join(root, "service-worker.js");
  const worker = await readFile(workerPath, "utf8");
  if (!worker.includes(VERSION_PLACEHOLDER)) {
    throw new Error(`service-worker.js does not contain ${VERSION_PLACEHOLDER}; the built worker cannot be versioned.`);
  }
  await writeFile(workerPath, worker.split(VERSION_PLACEHOLDER).join(version));
  return { version, files };
}
