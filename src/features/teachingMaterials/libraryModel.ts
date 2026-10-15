import type { TeachingMaterial, TeachingMaterialVersion } from "./materialTypes";

export interface LibraryEntry {
  material: TeachingMaterial;
  version: TeachingMaterialVersion;
}

/** Retain pinned older versions so tutors can still open/revoke their shares. */
export function buildLibraryEntries(materials: TeachingMaterial[], versions: TeachingMaterialVersion[]): LibraryEntry[] {
  const byMaterial = new Map(materials.map(material => [material.materialId, material]));
  return versions.flatMap(version => {
    const material = byMaterial.get(version.materialId);
    return material ? [{ material, version }] : [];
  });
}
