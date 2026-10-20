import { describe, expect, it } from "vitest";
import { buildLibraryEntries } from "./libraryModel";
import { compareMaterialLabels, groupMaterialsByTopic, labelGrant, parseMaterialDetails, suggestMaterialTopic, type MaterialDetails } from "./materialDetails";
import type { TeachingMaterial, TeachingMaterialVersion, MaterialGrant } from "./materialTypes";

describe("PDF details and subject organization", () => {
  it("orders numbered readings and modules numerically within a topic", () => {
    const items = ["Economics - Module 10", "Economics - Module 2", "Economics - Module 1"]
      .map(title => ({ title, readingNumber: null }));
    expect(items.sort(compareMaterialLabels).map(item => item.title)).toEqual([
      "Economics - Module 1", "Economics - Module 2", "Economics - Module 10",
    ]);
  });
  it("classifies Economics filenames ahead of the legacy default and keeps QM together", () => {
    expect(suggestMaterialTopic("hamad-cfa-economics-module-04-monetary-policy", "Quantitative Methods")).toBe("Economics");
    expect(suggestMaterialTopic("Rates and Returns", "Quantitative Methods")).toBe("Quantitative Methods");
    expect(suggestMaterialTopic("QM module 2")).toBe("Quantitative Methods");
    expect(suggestMaterialTopic("Fixed Income module 1")).toBe("Fixed Income");
    expect(suggestMaterialTopic("Unclassified handout")).toBe("Supplementary");
  });

  it("corrects only the chosen version and retains its immutable identity", () => {
    const material = { materialId: "r99-incorrect", currentVersionId: "new", topic: "Quantitative Methods" } as TeachingMaterial;
    const versions = [
      { materialId: material.materialId, versionId: "old", title: "Old", readingNumber: 99, sha256: "unchanged" },
      { materialId: material.materialId, versionId: "new", title: "New", readingNumber: 99, sha256: "different" },
    ] as TeachingMaterialVersion[];
    const details: MaterialDetails = { versionId: "old", title: "Economics - Module 3 - Fiscal Policy", readingNumber: null, topic: "Economics", revision: 1 };
    const entries = buildLibraryEntries([material], versions, [details]);
    expect(entries[0]).toMatchObject({ topic: "Economics", detailsRevision: 1,
      version: { versionId: "old", materialId: material.materialId, sha256: "unchanged", readingNumber: null, title: details.title } });
    expect(entries[1]!.version).toBe(versions[1]);
    expect(versions[0]!.title).toBe("Old");
    expect(groupMaterialsByTopic(entries, entry => entry.topic).map(group => [group.topic, group.items.length]))
      .toEqual([["Quantitative Methods", 1], ["Economics", 1]]);
  });

  it("overrides student labels while retaining access revision and content checks", () => {
    const grant = { versionId: "r01-mistake", title: "Original", readingNumber: 1, shareRevision: 3,
      sha256: "same", pageCount: 12, status: "active" } as MaterialGrant;
    const next = labelGrant(grant, { versionId: grant.versionId, title: "Fiscal Policy", readingNumber: null, topic: "Economics", revision: 2 });
    expect(next).toMatchObject({ ...grant, title: "Fiscal Policy", readingNumber: null, topic: "Economics" });
    expect(grant.title).toBe("Original");
  });

  it("rejects malformed corrections instead of masking them as valid labels", () => {
    const valid = { versionId: "v", title: "Fiscal Policy", readingNumber: null, topic: "Economics", revision: 1 };
    expect(parseMaterialDetails("v", valid)).toEqual(valid);
    for (const patch of [{ title: " " }, { readingNumber: 100 }, { readingNumber: 1.5 }, { topic: "Invented" }, { revision: 0 }, { versionId: "other" }]) {
      expect(parseMaterialDetails("v", { ...valid, ...patch })).toBeNull();
    }
  });
});
