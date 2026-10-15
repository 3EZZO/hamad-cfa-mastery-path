// Dry-run inventory of the private branded teaching PDFs.
//
// Reads every PDF in the source folder (default `output/pdf`), computes its
// SHA-256, byte size, page count and page sizes with the same pdf.js release
// the app uses, proposes the material labels the tutor upload would suggest,
// and writes the result to the git-ignored `output/pdf-import/` folder.
// It never uploads, modifies or regenerates a PDF.
//
//   node scripts/inventory-teaching-pdfs.mjs [sourceDir] [outputFile]
import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

const MAX_BYTES = 5 * 1024 * 1024;
const MAX_PAGES = 100;
const sourceDir = path.resolve(process.argv[2] || "output/pdf");
const outputFile = path.resolve(process.argv[3] || "output/pdf-import/inventory.json");

const SMALL_WORDS = new Set(["a", "an", "and", "as", "at", "by", "for", "in", "of", "on", "or", "the", "to"]);

// Mirrors proposeMaterialLabel() in src/features/teachingMaterials/materialTypes.ts.
function proposeLabel(fileName) {
  const base = fileName.replace(/\.pdf$/i, "");
  const match = /(?:^|[-_ ])reading[-_ ]?(\d{1,2})[-_ ](.+)$/i.exec(base);
  const words = (match ? match[2] : base).toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  const joined = [];
  for (let index = 0; index < words.length; index += 1) {
    if (words[index] === "non" && words[index + 1]) {
      joined.push(`non-${words[index + 1]}`);
      index += 1;
    } else joined.push(words[index]);
  }
  const title = joined
    .map((word, index) =>
      index > 0 && SMALL_WORDS.has(word)
        ? word
        : word.split("-").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join("-"),
    )
    .join(" ");
  return { readingNumber: match ? Number(match[1]) : null, title };
}

const entries = (await readdir(sourceDir)).filter((name) => name.toLowerCase().endsWith(".pdf")).sort();
const items = [];
for (const name of entries) {
  const bytes = await readFile(path.join(sourceDir, name));
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const signature = bytes.subarray(0, 1024).toString("latin1").includes("%PDF-");
  const loadingTask = getDocument({ data: new Uint8Array(bytes), verbosity: 0 });
  const document = await loadingTask.promise;
  const pageSizes = [];
  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const viewport = page.getViewport({ scale: 1 });
    pageSizes.push(`${Math.round(viewport.width)}x${Math.round(viewport.height)}`);
  }
  const pageCount = document.numPages;
  await loadingTask.destroy();
  const problems = [
    !signature && "missing %PDF- signature",
    bytes.length > MAX_BYTES && "larger than 5 MiB",
    pageCount > MAX_PAGES && "more than 100 pages",
  ].filter(Boolean);
  items.push({ file: name, ...proposeLabel(name), sha256, byteSize: bytes.length, pageCount, pageSizes: [...new Set(pageSizes)], problems });
}

const totals = {
  files: items.length,
  pages: items.reduce((sum, item) => sum + item.pageCount, 0),
  bytes: items.reduce((sum, item) => sum + item.byteSize, 0),
};
await mkdir(path.dirname(outputFile), { recursive: true });
await writeFile(outputFile, JSON.stringify({ generatedAt: new Date().toISOString(), sourceDir: path.relative(process.cwd(), sourceDir), totals, items }, null, 2) + "\n");

for (const item of items) {
  const reading = item.readingNumber === null ? "--" : String(item.readingNumber).padStart(2, "0");
  console.log(`${reading}  ${String(item.pageCount).padStart(3)}p  ${String(item.byteSize).padStart(8)}B  ${item.pageSizes.join(",")}  ${item.sha256.slice(0, 12)}  ${item.title}${item.problems.length ? `  !! ${item.problems.join("; ")}` : ""}`);
}
console.log(`Total: ${totals.files} files, ${totals.pages} pages, ${totals.bytes} bytes → ${path.relative(process.cwd(), outputFile)} (git-ignored)`);
