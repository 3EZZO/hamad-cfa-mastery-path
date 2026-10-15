import { createHash } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

const outputDirectory = path.resolve(process.argv[2] || "dist-pages");
const forbiddenFilePatterns = [
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
];
const forbiddenContentMarkers = [
  "Today is not a review of your old score",
  "C - 9.00%",
  "Fifty-six original proofs - questions first, answers later",
  "Minimum acceptable answer and pressure follow-up",
  // Pretty-printed mock test uploads carry source references next to answers.
  '"sourceFiles": [',
  // Private teaching-PDF file names and committed synthetic test fixtures.
  "hamad-cfa-reading-",
  "synthetic-password-1",
  "Synthetic reading A",
];

async function filesBelow(directory) {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) result.push(...(await filesBelow(absolute)));
    else result.push(absolute);
  }
  return result;
}

const outputStat = await stat(outputDirectory).catch(() => null);
if (!outputStat?.isDirectory()) {
  throw new Error(`Build output does not exist: ${outputDirectory}`);
}

const files = await filesBelow(outputDirectory);
const exposedFiles = files.filter((file) =>
  forbiddenFilePatterns.some((pattern) => pattern.test(path.basename(file))),
);
const exposedMarkers = [];

for (const file of files) {
  if (!/\.(?:html|js|css|json|txt|map)$/i.test(file)) continue;
  const content = await readFile(file, "utf8");
  for (const marker of forbiddenContentMarkers) {
    if (content.includes(marker)) {
      exposedMarkers.push(`${path.relative(outputDirectory, file)}: ${marker}`);
    }
  }
}

// Local-only deep check: when the private PDFs are present (never in CI),
// prove that neither their bytes, hashes, base64 encodings nor extracted
// text reached the build. Nothing from these files is stored in the repo.
const privatePdfDir = path.resolve("output", "pdf");
const privatePdfs = await readdir(privatePdfDir).catch(() => []);
let deepChecked = 0;
if (privatePdfs.length) {
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const fingerprints = [];
  for (const name of privatePdfs.filter((item) => item.toLowerCase().endsWith(".pdf"))) {
    const bytes = await readFile(path.join(privatePdfDir, name));
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    const markers = [sha256, bytes.subarray(0, 600).toString("base64").slice(8, 120)];
    const task = getDocument({ data: new Uint8Array(bytes), verbosity: 0 });
    const document = await task.promise;
    for (let page = 1; page <= document.numPages; page += 1) {
      const content = await (await document.getPage(page)).getTextContent();
      const text = content.items.map((item) => item.str ?? "").join(" ").replace(/\s+/g, " ").trim();
      // Long windows are specific to the branded summaries, not curriculum names.
      for (let start = 0; start + 70 <= text.length && markers.length < 40; start += 211) {
        markers.push(text.slice(start, start + 70));
      }
    }
    await task.destroy();
    fingerprints.push({ name, sha256, markers });
  }
  for (const file of files) {
    const buffer = await readFile(file);
    const digest = createHash("sha256").update(buffer).digest("hex");
    const content = /\.(?:html|js|mjs|css|json|txt|map|webmanifest|svg)$/i.test(file) ? buffer.toString("utf8") : "";
    for (const fingerprint of fingerprints) {
      if (digest === fingerprint.sha256) exposedFiles.push(file);
      for (const marker of fingerprint.markers) {
        if (content && content.includes(marker)) {
          exposedMarkers.push(`${path.relative(outputDirectory, file)}: private teaching PDF content (${fingerprint.name})`);
          break;
        }
      }
    }
  }
  deepChecked = fingerprints.length;
}

if (exposedFiles.length || exposedMarkers.length) {
  throw new Error([
    "Private tutor content was found in the public build.",
    ...exposedFiles.map((file) => `file: ${path.relative(outputDirectory, file)}`),
    ...exposedMarkers.map((marker) => `content: ${marker}`),
  ].join("\n"));
}

console.log(
  `Private-content audit passed for ${files.length} public build files` +
    (deepChecked ? ` (including a local check against ${deepChecked} private teaching PDFs).` : "."),
);
