export interface ContentFingerprint {
  label: string;
  hashes: string[];
  markers: string[];
}
export interface PrivateSources {
  pdfDir?: string;
  bankDir?: string;
  mockDirs?: string[];
}
export interface BuildAudit {
  fileCount: number;
  exposedFiles: string[];
  exposedMarkers: string[];
  deepChecked: string[];
}
export const FORBIDDEN_FILE_PATTERNS: readonly RegExp[];
export const FORBIDDEN_CONTENT_MARKERS: readonly string[];
export function filesBelow(directory: string): Promise<string[]>;
export function textWindows(text: unknown, limit: number, size?: number, step?: number): string[];
export function pdfFingerprints(directory: string): Promise<ContentFingerprint[]>;
export function bankFingerprints(directory: string): Promise<ContentFingerprint[]>;
export function mockUploadFingerprints(directory: string): Promise<ContentFingerprint[]>;
export function auditBuild(outputDirectory: string, privateSources?: PrivateSources): Promise<BuildAudit>;
