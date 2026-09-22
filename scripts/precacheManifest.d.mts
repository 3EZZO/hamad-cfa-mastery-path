export const MANIFEST_FILE: "precache-manifest.json";
export const VERSION_PLACEHOLDER: "__BUILD_VERSION__";
export function collectPrecacheFiles(root: string): Promise<string[]>;
export function manifestVersion(files: readonly string[], indexHtml: string): string;
export function writePrecacheManifest(root: string): Promise<{ version: string; files: string[] }>;
