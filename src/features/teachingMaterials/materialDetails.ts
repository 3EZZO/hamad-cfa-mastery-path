import { normalizeMaterialTitle, normalizeReadingNumber, type MaterialGrant } from "./materialTypes";

export const MATERIAL_TOPICS = [
  "Quantitative Methods", "Economics", "Financial Statement Analysis", "Corporate Issuers",
  "Equity Investments", "Fixed Income", "Derivatives", "Alternative Investments",
  "Portfolio Management", "Ethical and Professional Standards", "Supplementary",
] as const;
export type MaterialTopic = typeof MATERIAL_TOPICS[number];

export interface MaterialLabels {
  title: string;
  readingNumber: number | null;
  topic: MaterialTopic;
}

/** Editable display labels; the PDF manifest, identity and bytes remain immutable. */
export interface MaterialDetails extends MaterialLabels {
  versionId: string;
  revision: number;
}

export type LabeledMaterialGrant = MaterialGrant & { topic: MaterialTopic };

export function normalizeMaterialTopic(value: unknown): MaterialTopic {
  if (typeof value !== "string") return "Supplementary";
  if (value.trim().toLowerCase() === "qm") return "Quantitative Methods";
  return MATERIAL_TOPICS.find(topic => topic.toLowerCase() === value.trim().toLowerCase()) ?? "Supplementary";
}

/** Explicit subject names take precedence over the legacy QM upload default. */
export function suggestMaterialTopic(title: string, fallback?: unknown): MaterialTopic {
  const words = title.replace(/[-_]+/g, " ");
  for (const topic of MATERIAL_TOPICS.slice(0, -1)) {
    if (words.toLowerCase().includes(topic.toLowerCase())) return topic;
  }
  if (/\bqm\b/i.test(words)) return "Quantitative Methods";
  if (/\bethics\b/i.test(words)) return "Ethical and Professional Standards";
  return normalizeMaterialTopic(fallback);
}

export function parseMaterialDetails(versionId: string, value: unknown): MaterialDetails | null {
  if (!value || typeof value !== "object") return null;
  const data = value as Record<string, unknown>;
  if (data.versionId !== versionId || typeof data.title !== "string"
    || !normalizeMaterialTitle(data.title) || data.title.length > 160
    || (data.readingNumber !== null && normalizeReadingNumber(data.readingNumber) !== data.readingNumber)
    || !MATERIAL_TOPICS.includes(data.topic as MaterialTopic)
    || !Number.isSafeInteger(data.revision) || Number(data.revision) < 1) return null;
  return { versionId, title: data.title, readingNumber: data.readingNumber as number | null,
    topic: data.topic as MaterialTopic, revision: Number(data.revision) };
}

export function labelGrant(grant: MaterialGrant, details?: MaterialDetails | null): LabeledMaterialGrant {
  const legacyQm = /^r(?:0[1-9]|1[01])-/.test(grant.versionId) ? "Quantitative Methods" : "Supplementary";
  return details ? { ...grant, title: details.title, readingNumber: details.readingNumber, topic: details.topic }
    : { ...grant, topic: suggestMaterialTopic(grant.title, legacyQm) };
}

export function groupMaterialsByTopic<T>(items: readonly T[], topicFor: (item: T) => MaterialTopic) {
  return MATERIAL_TOPICS.map(topic => ({ topic, items: items.filter(item => topicFor(item) === topic) }))
    .filter(group => group.items.length > 0);
}

export function compareMaterialLabels(a: Pick<MaterialLabels, "title" | "readingNumber">, b: Pick<MaterialLabels, "title" | "readingNumber">) {
  return (a.readingNumber ?? 999) - (b.readingNumber ?? 999)
    || a.title.localeCompare(b.title, undefined, { numeric: true, sensitivity: "base" });
}
