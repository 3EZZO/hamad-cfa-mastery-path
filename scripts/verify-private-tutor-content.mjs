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
];
const forbiddenContentMarkers = [
  "Today is not a review of your old score",
  "C - 9.00%",
  "Fifty-six original proofs - questions first, answers later",
  "Minimum acceptable answer and pressure follow-up",
  // Pretty-printed mock test uploads carry source references next to answers.
  '"sourceFiles": [',
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

if (exposedFiles.length || exposedMarkers.length) {
  throw new Error([
    "Private tutor content was found in the public build.",
    ...exposedFiles.map((file) => `file: ${path.relative(outputDirectory, file)}`),
    ...exposedMarkers.map((marker) => `content: ${marker}`),
  ].join("\n"));
}

console.log(`Private-content audit passed for ${files.length} public build files.`);
