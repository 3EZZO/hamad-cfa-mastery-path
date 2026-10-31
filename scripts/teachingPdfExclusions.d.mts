export interface TeachingPdfExclusion {
  file: string;
  reason: string;
}
export function loadTeachingPdfExclusions(file: string): Promise<TeachingPdfExclusion[]>;
export function partitionTeachingPdfs(
  names: readonly string[],
  exclusions: readonly TeachingPdfExclusion[],
): { included: string[]; excluded: string[] };
