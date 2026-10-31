import { createHash } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

/**
 * Private-content audit of the public build (see verify-private-tutor-content.mjs).
 *
 * Generic rules catch private file names and marker strings anywhere. When the
 * private sources are present on this machine (never in CI), a deep check also
 * proves that none of their bytes, hashes, encodings or text reached the build:
 * the branded teaching PDFs, the structured question bank and its images, and
 * every mock test upload. Nothing from these files is stored in the repo.
 */
export const FORBIDDEN_FILE_PATTERNS = [
  /Hamad_CFA_Level_I_Session_\d+_.*Tutor_Playbook\.pdf$/i,
  /session[-_]?\d+.*playbook.*\.json$/i,
  /tutor[-_]?bible.*\.(?:pdf|json)$/i,
  // Module mock test uploads and their answer keys are tutor-only.
  /\.mock\.json$/i,
  /answer[-_]?key.*\.(?:md|json|pdf)$/i,
  // Teaching PDFs reach students only through authenticated per-version
  // grants; no PDF (real or synthetic) may ship as a public asset.
  /\.pdf$/i,
  /^hamad-cfa-reading-/i,
  /^inventory\.json$/i,
  // The structured question bank and its source images.
  /^question-bank\.json$/i,
  /^questions\.jsonl$/i,
  /^finquiz-\d+-(?:prompt|explanation)\.png$/i,
];

export const FORBIDDEN_CONTENT_MARKERS = [
  "Today is not a review of your old score",
  "C - 9.00%",
  "Fifty-six original proofs - questions first, answers later",
  "Minimum acceptable answer and pressure follow-up",
  // Pretty-printed mock test uploads carry source references next to answers.
  '"sourceFiles": [',
  // Stable question-bank ids; they link a question to its private source.
  "mp-fq-",
  // Private teaching-PDF file names and committed synthetic test fixtures.
  "hamad-cfa-reading-",
  "synthetic-password-1",
  "Synthetic reading A",
  // The development-only mock preview (src/features/mockTests/DevPaperPreview.tsx)
  // must never ship: it reads private mock files from the local machine.
  "dev-paper-preview-harness",
];

const TEXT_FILE = /\.(?:html|js|mjs|css|json|txt|map|webmanifest|svg)$/i;
/** Text windows this long are specific to one private document, not to curriculum vocabulary. */
const WINDOW = 70;
const PDF_MARKERS = 40;

export async function filesBelow(directory) {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) result.push(...(await filesBelow(absolute)));
    else result.push(absolute);
  }
  return result;
}

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const squash = (text) => String(text ?? "").replace(/\s+/g, " ").trim();

/** Up to `limit` windows of `size` characters, spread through the text. */
export function textWindows(text, limit, size = WINDOW, step = 211) {
  const clean = squash(text);
  const windows = [];
  for (let start = 0; start + size <= clean.length && windows.length < limit; start += step) {
    windows.push(clean.slice(start, start + size));
  }
  return windows;
}

/**
 * A base64 slice from inside the file, where shared format headers have ended.
 * The offset is a multiple of 3 so the slice also matches the file inlined as base64.
 */
function bytesMarker(bytes, offset) {
  return bytes.subarray(offset, offset + 600).toString("base64").slice(8, 120);
}

async function exists(target) {
  return Boolean(await stat(target).catch(() => null));
}

/** Teaching and source PDFs: hash, an encoded byte slice and text windows. */
export async function pdfFingerprints(directory) {
  const names = (await readdir(directory).catch(() => [])).filter((name) => name.toLowerCase().endsWith(".pdf"));
  if (!names.length) return [];
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const fingerprints = [];
  for (const name of names) {
    const bytes = await readFile(path.join(directory, name));
    const digest = sha256(bytes);
    const markers = [digest, bytesMarker(bytes, 0)];
    const task = getDocument({ data: new Uint8Array(bytes), verbosity: 0 });
    const document = await task.promise;
    // Stop paging once the markers are collected: an 888-page edition needs no more.
    for (let page = 1; page <= document.numPages && markers.length < PDF_MARKERS; page += 1) {
      const content = await (await document.getPage(page)).getTextContent();
      const text = content.items.map((item) => item.str ?? "").join(" ");
      markers.push(...textWindows(text, PDF_MARKERS - markers.length));
    }
    await task.destroy();
    fingerprints.push({ label: `private teaching PDF content (${name})`, hashes: [digest], markers });
  }
  return fingerprints;
}

/** The structured question bank: its JSON, every source image, and its prompt/explanation text. */
export async function bankFingerprints(directory) {
  const bankFile = path.join(directory, "question-bank.json");
  if (!(await exists(bankFile))) return [];
  const bankBytes = await readFile(bankFile);
  const bank = JSON.parse(bankBytes.toString("utf8"));
  const hashes = [sha256(bankBytes)];
  const markers = [];
  const assets = path.join(directory, "assets");
  for (const name of (await readdir(assets).catch(() => [])).filter((item) => item.toLowerCase().endsWith(".png"))) {
    const bytes = await readFile(path.join(assets, name));
    hashes.push(sha256(bytes));
    markers.push(bytesMarker(bytes, 300));
  }
  for (const question of bank.questions ?? []) {
    markers.push(...textWindows(question.prompt?.statementOcrText ?? question.prompt?.ocrText, 1));
    markers.push(...textWindows(question.explanation?.ocrText, 2));
  }
  for (const item of bank.cases ?? []) markers.push(...textWindows(item.contextOcr, 2));
  return [{ label: "private question bank content", hashes, markers }];
}

/** Every mock test upload below the directory: stems, explanations and the file itself. */
export async function mockUploadFingerprints(directory) {
  if (!(await exists(directory))) return [];
  const uploads = (await filesBelow(directory)).filter((file) => /\.mock\.json$/i.test(file));
  const fingerprints = [];
  for (const file of uploads) {
    const bytes = await readFile(file);
    let upload;
    try {
      upload = JSON.parse(bytes.toString("utf8"));
    } catch {
      continue;
    }
    const markers = [];
    for (const question of upload.questions ?? []) {
      const stem = squash(question.stem);
      // Short stems are too generic to be evidence; long ones get one window.
      if (stem.length >= 48) markers.push(stem.slice(0, Math.min(WINDOW, stem.length)));
      markers.push(...textWindows(question.explanation, 1));
    }
    fingerprints.push({ label: `private mock test content (${path.basename(file)})`, hashes: [sha256(bytes)], markers });
  }
  return fingerprints;
}

/**
 * Audits a build directory. Returns the problems found; an empty `exposedFiles`
 * and `exposedMarkers` means the build is clean.
 */
export async function auditBuild(outputDirectory, privateSources = {}) {
  const outputStat = await stat(outputDirectory).catch(() => null);
  if (!outputStat?.isDirectory()) throw new Error(`Build output does not exist: ${outputDirectory}`);

  const files = await filesBelow(outputDirectory);
  const relative = (file) => path.relative(outputDirectory, file);
  const exposedFiles = files
    .filter((file) => FORBIDDEN_FILE_PATTERNS.some((pattern) => pattern.test(path.basename(file))))
    .map(relative);
  const exposedMarkers = [];

  const fingerprints = [
    ...(privateSources.pdfDir ? await pdfFingerprints(privateSources.pdfDir) : []),
    ...(privateSources.bankDir ? await bankFingerprints(privateSources.bankDir) : []),
    ...(await Promise.all((privateSources.mockDirs ?? []).map(mockUploadFingerprints))).flat(),
  ];

  for (const file of files) {
    const buffer = await readFile(file);
    const text = TEXT_FILE.test(file) ? buffer.toString("utf8") : "";
    for (const marker of FORBIDDEN_CONTENT_MARKERS) {
      if (text.includes(marker)) exposedMarkers.push(`${relative(file)}: ${marker}`);
    }
    if (!fingerprints.length) continue;
    const digest = sha256(buffer);
    for (const fingerprint of fingerprints) {
      if (fingerprint.hashes.includes(digest)) exposedFiles.push(`${relative(file)} (${fingerprint.label})`);
      if (text && fingerprint.markers.some((marker) => marker && text.includes(marker))) {
        exposedMarkers.push(`${relative(file)}: ${fingerprint.label}`);
      }
    }
  }

  return {
    fileCount: files.length,
    exposedFiles,
    exposedMarkers,
    deepChecked: fingerprints.map((fingerprint) => fingerprint.label),
  };
}
