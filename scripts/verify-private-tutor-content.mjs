// Fails the Pages build when private tutor content reached the public output.
// The rules and the deep checks live in privateContentGuard.mjs.
//
//   node scripts/verify-private-tutor-content.mjs [dist-pages]
import path from "node:path";
import { auditBuild } from "./privateContentGuard.mjs";

const outputDirectory = path.resolve(process.argv[2] || "dist-pages");

// Local-only deep check sources; absent in CI, where only the generic rules run.
const result = await auditBuild(outputDirectory, {
  pdfDir: path.resolve("output", "pdf"),
  bankDir: path.resolve("output", "finquiz-bank"),
  mockDirs: [path.resolve("mock-test-questions")],
});

if (result.exposedFiles.length || result.exposedMarkers.length) {
  throw new Error([
    "Private tutor content was found in the public build.",
    ...result.exposedFiles.map((file) => `file: ${file}`),
    ...result.exposedMarkers.map((marker) => `content: ${marker}`),
  ].join("\n"));
}

console.log(
  `Private-content audit passed for ${result.fileCount} public build files` +
    (result.deepChecked.length ? ` (including a local check against ${result.deepChecked.length} private sources).` : "."),
);
