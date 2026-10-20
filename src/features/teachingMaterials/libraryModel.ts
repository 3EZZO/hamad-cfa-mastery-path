import type { TeachingMaterial, TeachingMaterialVersion } from "./materialTypes";
import { suggestMaterialTopic, type MaterialDetails, type MaterialTopic } from "./materialDetails";

export interface LibraryEntry {
  material: TeachingMaterial;
  version: TeachingMaterialVersion;
  sourceVersion: TeachingMaterialVersion;
  topic: MaterialTopic;
  detailsRevision: number;
}

/** Retain pinned older versions so tutors can still open/revoke their shares. */
export function buildLibraryEntries(materials: TeachingMaterial[], versions: TeachingMaterialVersion[], details: MaterialDetails[] = []): LibraryEntry[] {
  const byMaterial = new Map(materials.map(material => [material.materialId, material]));
  const byVersion = new Map(details.map(item => [item.versionId, item]));
  return versions.flatMap(version => {
    const material = byMaterial.get(version.materialId);
    const labels = byVersion.get(version.versionId);
    return material ? [{ material, sourceVersion: version,
      version: labels ? { ...version, title: labels.title, readingNumber: labels.readingNumber } : version,
      topic: labels?.topic ?? suggestMaterialTopic(version.title, material.topic),
      detailsRevision: labels?.revision ?? 0,
    }] : [];
  });
}
