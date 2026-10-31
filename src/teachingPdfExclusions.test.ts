import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadTeachingPdfExclusions, partitionTeachingPdfs } from "../scripts/teachingPdfExclusions.mjs";

let root: string;
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "pdf-exclude-"));
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("teaching PDF inventory exclusions", () => {
  it("excludes listed PDFs by exact, case-insensitive name and ignores other files", () => {
    const names = ["reading-02.pdf", "Reference-Edition.PDF", "reading-01.pdf", "notes.txt"];
    const result = partitionTeachingPdfs(names, [{ file: "reference-edition.pdf", reason: "not teaching material" }]);
    expect(result).toEqual({ included: ["reading-01.pdf", "reading-02.pdf"], excluded: ["Reference-Edition.PDF"] });
  });

  it("does not treat a listed name as a prefix or pattern", () => {
    const result = partitionTeachingPdfs(["edition.pdf", "edition-2.pdf"], [{ file: "edition.pdf", reason: "" }]);
    expect(result.included).toEqual(["edition-2.pdf"]);
  });

  it("excludes nothing when the private list is absent", async () => {
    expect(await loadTeachingPdfExclusions(join(root, "missing.json"))).toEqual([]);
  });

  it("reads the private list and rejects a malformed one", async () => {
    const good = join(root, "exclude.json");
    await writeFile(good, JSON.stringify({ exclude: [{ file: "edition.pdf", reason: "reference only" }] }));
    expect(await loadTeachingPdfExclusions(good)).toEqual([{ file: "edition.pdf", reason: "reference only" }]);

    const bad = join(root, "bad.json");
    await writeFile(bad, JSON.stringify({ exclude: [{ file: "edition.docx" }] }));
    await expect(loadTeachingPdfExclusions(bad)).rejects.toThrow("must be a PDF file name");
    await writeFile(bad, JSON.stringify({ files: [] }));
    await expect(loadTeachingPdfExclusions(bad)).rejects.toThrow('"exclude" list');
  });
});
