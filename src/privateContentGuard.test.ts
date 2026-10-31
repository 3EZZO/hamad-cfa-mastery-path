import { randomBytes } from "node:crypto";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { auditBuild, pdfFingerprints, textWindows } from "../scripts/privateContentGuard.mjs";
import { syntheticPdf } from "./testFixtures/syntheticPdf";

// Synthetic private sources and a synthetic build: the guard logic, never real content.
const EXPLANATION = "Synthetic explanation: the weighted mean of the three synthetic returns equals the quoted figure here.";
const STEM = "A synthetic analyst gathers five synthetic dividend yields and asks for the second quartile value.";
let root: string;
let dist: string;
let sources: { pdfDir: string; bankDir: string; mockDirs: string[] };
let image: Buffer;
// Wide pages keep each synthetic line whole, so every page yields one 70-character window.
const wide = (pages: number) => Array.from({ length: pages }, (): [number, number] => [1800, 792]);

async function put(path: string, content: string | Uint8Array) {
  await mkdir(join(path, ".."), { recursive: true });
  await writeFile(path, content);
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "guard-"));
  dist = join(root, "dist");
  sources = { pdfDir: join(root, "pdf"), bankDir: join(root, "bank"), mockDirs: [join(root, "mocks")] };
  image = randomBytes(2400);
  await put(join(dist, "index.html"), "<html><script src=\"/assets/index.js\"></script></html>");
  await put(join(dist, "assets", "index.js"), "console.log('public app code');");
  await put(join(sources.pdfDir, "private-reading.pdf"), syntheticPdf({ pages: 2, label: "Synthetic private reading on the term structure of synthetic rates and spreads", sizes: wide(2) }));
  await put(join(sources.bankDir, "question-bank.json"), JSON.stringify({
    questions: [{ id: "bank-1", prompt: { ocrText: STEM }, explanation: { ocrText: EXPLANATION } }],
    cases: [],
  }));
  await put(join(sources.bankDir, "assets", "item-1-prompt.png"), image);
  await put(join(sources.mockDirs[0]!, "paper", "synthetic-paper.mock.json"), JSON.stringify({
    questions: [{ stem: STEM, explanation: EXPLANATION, options: ["A", "B", "C"] }],
  }));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("private content guard", () => {
  it("passes a clean build and reports every deep-checked source", async () => {
    const result = await auditBuild(dist, sources);
    expect(result.exposedFiles).toEqual([]);
    expect(result.exposedMarkers).toEqual([]);
    expect(result.deepChecked).toHaveLength(3);
  });

  it("finds question-bank text, ids and file names in the build", async () => {
    await put(join(dist, "assets", "chunk.js"), `const x = ${JSON.stringify(EXPLANATION)}; const id = "mp-fq-462464";`);
    await put(join(dist, "question-bank.json"), "{}");
    const result = await auditBuild(dist, sources);
    expect(result.exposedMarkers.some((line) => line.includes("private question bank content"))).toBe(true);
    expect(result.exposedMarkers.some((line) => line.endsWith("mp-fq-"))).toBe(true);
    expect(result.exposedFiles).toContain("question-bank.json");
  });

  it("finds a source image copied under another name or inlined as base64", async () => {
    await put(join(dist, "assets", "logo-1a2b.png"), image);
    await put(join(dist, "assets", "inline.js"), `const src = "data:image/png;base64,${image.toString("base64")}";`);
    const result = await auditBuild(dist, sources);
    expect(result.exposedFiles.some((line) => line.startsWith(join("assets", "logo-1a2b.png")))).toBe(true);
    expect(result.exposedMarkers.some((line) => line.startsWith(join("assets", "inline.js")))).toBe(true);
  });

  it("finds a mock test question stem in the build", async () => {
    await put(join(dist, "assets", "paper.js"), `export default ${JSON.stringify({ stem: STEM })};`);
    const result = await auditBuild(dist, { mockDirs: sources.mockDirs });
    expect(result.exposedMarkers).toEqual([join("assets", "paper.js") + ": private mock test content (synthetic-paper.mock.json)"]);
  });

  it("finds private PDF text in the build", async () => {
    await put(join(dist, "assets", "reader.js"), "const t = 'Synthetic private reading on the term structure of synthetic rates and spreads page 1';");
    const result = await auditBuild(dist, { pdfDir: sources.pdfDir });
    expect(result.exposedMarkers.some((line) => line.includes("private-reading.pdf"))).toBe(true);
  });

  it("stops reading a long PDF once its markers are collected", async () => {
    // 62 characters, so "<label> page NN" is exactly one 70-character window from page 10 on.
    const label = "Synthetic long edition with a line of text on every single pag";
    await put(join(sources.pdfDir, "private-reading.pdf"), syntheticPdf({ pages: 60, label, sizes: wide(60) }));
    const [fingerprint] = await pdfFingerprints(sources.pdfDir);
    expect(fingerprint!.markers).toHaveLength(40);
    // Digest and byte slice, then pages 10-47; pages 48-60 are never needed.
    expect(fingerprint!.markers.at(-1)).toBe(`${label} page 47`);
    expect(fingerprint!.markers.some((marker) => marker.endsWith("page 48"))).toBe(false);
  });

  it("only uses text windows long enough to be specific", () => {
    expect(textWindows("short text", 3)).toEqual([]);
    expect(textWindows("x".repeat(500), 2)).toHaveLength(2);
  });
});
