import { readFile } from "node:fs/promises";

/**
 * PDFs in the teaching-PDF source folder that are not teaching materials
 * (e.g. a private question-bank reference edition) and must never be
 * inventoried for upload. The list is a private, git-ignored file:
 *
 *   { "exclude": [{ "file": "name.pdf", "reason": "why" }] }
 *
 * A missing file means nothing is excluded. A malformed one fails loudly
 * rather than silently letting an excluded PDF through.
 */
export async function loadTeachingPdfExclusions(file) {
  let text;
  try {
    text = await readFile(file, "utf8");
  } catch (error) {
    if (error && error.code === "ENOENT") return [];
    throw error;
  }
  const parsed = JSON.parse(text);
  if (!parsed || !Array.isArray(parsed.exclude)) throw new Error(`${file} must have an "exclude" list.`);
  return parsed.exclude.map((entry, index) => {
    if (!entry || typeof entry.file !== "string" || !entry.file.toLowerCase().endsWith(".pdf")) {
      throw new Error(`${file}: exclude[${index}].file must be a PDF file name.`);
    }
    return { file: entry.file, reason: typeof entry.reason === "string" ? entry.reason : "" };
  });
}

/** Splits folder entries into the PDFs to inventory and the excluded ones (exact, case-insensitive names). */
export function partitionTeachingPdfs(names, exclusions) {
  const excluded = new Set(exclusions.map((entry) => entry.file.toLowerCase()));
  const pdfs = names.filter((name) => name.toLowerCase().endsWith(".pdf")).sort();
  return {
    included: pdfs.filter((name) => !excluded.has(name.toLowerCase())),
    excluded: pdfs.filter((name) => excluded.has(name.toLowerCase())),
  };
}
