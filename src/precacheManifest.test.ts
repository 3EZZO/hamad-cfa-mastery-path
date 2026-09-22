import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  collectPrecacheFiles,
  manifestVersion,
  VERSION_PLACEHOLDER,
  writePrecacheManifest,
} from "../scripts/precacheManifest.mjs";

// A synthetic dist directory: the manifest logic, not a real build.
let root: string;
async function put(path: string, content = path) {
  await mkdir(join(root, path, ".."), { recursive: true });
  await writeFile(join(root, path), content);
}
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "precache-"));
  await put("index.html", "<html><script src=\"/assets/index-abc.js\"></script></html>");
  await put("manifest.webmanifest");
  await put("theme-init.js");
  await put("project-202-mark.svg");
  await put("404.html");
  await put("service-worker.js", `const BUILD_VERSION = "${VERSION_PLACEHOLDER}";`);
  await put("assets/index-abc.js");
  await put("assets/PracticeCoach-lazy.js");
  await put("assets/vendor-react-x.js");
  await put("fonts/sora.woff2");
  await put("fonts/NOTICE.txt");
  await put("icons/project-202-192.png");
});
afterEach(() => rm(root, { recursive: true, force: true }));

describe("precache manifest", () => {
  it("lists the shell, every asset chunk, fonts and icons, and nothing else", async () => {
    const files = await collectPrecacheFiles(root);
    expect(files).toEqual([
      "assets/PracticeCoach-lazy.js",
      "assets/index-abc.js",
      "assets/vendor-react-x.js",
      "fonts/sora.woff2",
      "icons/project-202-192.png",
      "index.html",
      "manifest.webmanifest",
      "project-202-mark.svg",
      "theme-init.js",
    ]);
  });

  it("versions by content: stable on a rebuild, new when a chunk or the html changes", () => {
    const files = ["assets/a.js", "index.html"];
    const version = manifestVersion(files, "<html>1</html>");
    expect(version).toMatch(/^[0-9a-f]{16}$/);
    expect(manifestVersion([...files], "<html>1</html>")).toBe(version);
    expect(manifestVersion(["assets/b.js", "index.html"], "<html>1</html>")).not.toBe(version);
    expect(manifestVersion(files, "<html>2</html>")).not.toBe(version);
  });

  it("writes the manifest and stamps the same version into the worker", async () => {
    const { version, files } = await writePrecacheManifest(root);
    const manifest = JSON.parse(await readFile(join(root, "precache-manifest.json"), "utf8"));
    expect(manifest).toEqual({ version, files });
    expect(files).toContain("assets/PracticeCoach-lazy.js");
    const worker = await readFile(join(root, "service-worker.js"), "utf8");
    expect(worker).toBe(`const BUILD_VERSION = "${version}";`);
    // Second run over the same output is idempotent apart from the already-stamped worker.
    await writeFile(join(root, "service-worker.js"), `const BUILD_VERSION = "${VERSION_PLACEHOLDER}";`);
    expect((await writePrecacheManifest(root)).version).toBe(version);
  });

  it("refuses to stamp a worker that has no placeholder", async () => {
    await writeFile(join(root, "service-worker.js"), "const BUILD_VERSION = \"already\";");
    await expect(writePrecacheManifest(root)).rejects.toThrow(/placeholder|versioned/);
  });

  it("keeps the source worker on the placeholder with a manifest-first install and a discovery fallback", async () => {
    const source = await readFile(new URL("../public/service-worker.js", import.meta.url), "utf8");
    expect(source).toContain(`const BUILD_VERSION = "${VERSION_PLACEHOLDER}";`);
    expect(source).toMatch(/fetch\(`\$\{APP_BASE\}\$\{PRECACHE_MANIFEST\}`, \{ cache: "no-store" \}\)/);
    expect(source).toMatch(/await precacheFromManifest\(cache\);\s*return;\s*\} catch/);
    expect(source).toContain("await cache.addAll(APP_SHELL);");
    expect(source.indexOf('addEventListener("install"')).toBeGreaterThan(source.indexOf("async function installAppShell"));
  });
});
