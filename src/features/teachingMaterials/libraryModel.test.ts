import { describe, expect, it } from "vitest";
import { buildLibraryEntries } from "./libraryModel";
import type { TeachingMaterial, TeachingMaterialVersion } from "./materialTypes";

describe("versioned tutor library", () => {
  it("retains the older shared version after replacement, with its own title", () => {
    const material = { materialId: "r01-rates", currentVersionId: "new", title: "Current title" } as TeachingMaterial;
    const versions = [
      { materialId: material.materialId, versionId: "old", title: "Original title" },
      { materialId: material.materialId, versionId: "new", title: "Current title" },
      { materialId: "missing-catalog", versionId: "orphan" },
    ] as TeachingMaterialVersion[];
    const entries = buildLibraryEntries([material], versions);
    expect(entries.map(entry => [entry.version.versionId, entry.version.title])).toEqual([
      ["old", "Original title"], ["new", "Current title"],
    ]);
    expect(entries[0]!.material.currentVersionId).toBe("new");
  });
});
