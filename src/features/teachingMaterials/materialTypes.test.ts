import { describe, expect, it } from "vitest";
import { Buffer } from "node:buffer";
import {
  clampPage, clampZoom, hasPdfSignature, materialIdFor, normalizeSessionNumbers, parseGrant,
  parseVersionId, planReceipt, planRevoke, planShare, proposeMaterialLabel, receiptCountsAsOpened,
  sanitizeReaderPreference, sortShares, chunkCountFor, chunkIdFor, splitIntoChunks, joinChunks,
  MATERIAL_CHUNK_BYTES, MAX_MATERIAL_BYTES, validatePageCount, validatePdfFileShape,
  versionIdFor, type MaterialGrant,
} from "./materialTypes";
import { syntheticPdf } from "../../testFixtures/syntheticPdf";

const SHA = "a".repeat(64);

describe("teaching material identifiers", () => {
  it("derives stable, path-safe material and version ids", () => {
    expect(materialIdFor("Rates and Returns", 1)).toBe("r01-rates-and-returns");
    expect(materialIdFor("Simple Linear Regression", 10)).toBe("r10-simple-linear-regression");
    expect(materialIdFor("Formula sheet!", null)).toBe("m-formula-sheet");
    expect(materialIdFor("x".repeat(200), 3).length).toBeLessThanOrEqual(60);
    const versionId = versionIdFor("r01-rates-and-returns", SHA);
    expect(versionId).toBe(`r01-rates-and-returns-${SHA}`);
    expect(parseVersionId(versionId)).toEqual({ materialId: "r01-rates-and-returns", sha256: SHA });
  });

  it("refuses ids that could escape the storage namespace", () => {
    expect(() => versionIdFor("../x", SHA)).toThrow();
    expect(() => versionIdFor("r01", "not-a-hash")).toThrow();
    expect(parseVersionId(`../${SHA}`)).toBeNull();
    expect(parseVersionId(`r01/evil-${SHA}`)).toBeNull();
    expect(parseVersionId("r01-rates")).toBeNull();
  });

  it("proposes labels from file names without trusting them as identity", () => {
    expect(proposeMaterialLabel("hamad-cfa-reading-02-time-value-of-money-in-finance.pdf"))
      .toEqual({ readingNumber: 2, title: "Time Value of Money in Finance" });
    expect(proposeMaterialLabel("hamad-cfa-reading-09-parametric-and-non-parametric-tests-of-independence.pdf"))
      .toEqual({ readingNumber: 9, title: "Parametric and Non-Parametric Tests of Independence" });
    expect(proposeMaterialLabel("Formula Sheet.pdf")).toEqual({ readingNumber: null, title: "Formula Sheet" });
  });
});

describe("PDF file validation", () => {
  const pdf = syntheticPdf();
  it("accepts a real PDF signature and rejects other files", () => {
    expect(hasPdfSignature(pdf)).toBe(true);
    expect(validatePdfFileShape({ name: "a.pdf", type: "application/pdf", size: pdf.length }, pdf)).toBeNull();
    expect(validatePdfFileShape({ name: "a.pdf", type: "", size: pdf.length }, pdf)).toBeNull();
    expect(validatePdfFileShape({ name: "a.txt", type: "text/plain", size: 10 }, pdf)).toMatch(/Only \.pdf/);
    expect(validatePdfFileShape({ name: "a.pdf", type: "text/html", size: 10 }, pdf)).toMatch(/not report/);
    expect(validatePdfFileShape({ name: "a.pdf", type: "", size: MAX_MATERIAL_BYTES + 1 }, pdf)).toMatch(/5 MiB/);
    expect(validatePdfFileShape({ name: "a.pdf", type: "", size: 5 }, new TextEncoder().encode("hello"))).toMatch(/signature/);
    expect(validatePageCount(0)).toMatch(/no readable/);
    expect(validatePageCount(101)).toMatch(/more than 100/);
    expect(validatePageCount(4)).toBeNull();
  });
});

describe("bounded binary chunking", () => {
  it("round-trips boundary and maximum sizes without empty trailing chunks", () => {
    for (const size of [1, MATERIAL_CHUNK_BYTES, MATERIAL_CHUNK_BYTES + 1, MAX_MATERIAL_BYTES]) {
      const bytes = new Uint8Array(size);
      bytes[0] = 37;
      bytes[size - 1] = 255;
      const chunks = splitIntoChunks(bytes);
      expect(chunks.length).toBe(chunkCountFor(size));
      expect(chunks.every(chunk => chunk.byteLength > 0 && chunk.byteLength <= MATERIAL_CHUNK_BYTES)).toBe(true);
      expect(Buffer.from(joinChunks(chunks)).equals(Buffer.from(bytes))).toBe(true);
    }
    expect(chunkCountFor(MAX_MATERIAL_BYTES)).toBe(6);
  });

  it("rejects invalid byte sizes and chunk indices", () => {
    for (const size of [0, -1, 1.5, NaN, Infinity, MAX_MATERIAL_BYTES + 1]) {
      expect(() => chunkCountFor(size)).toThrow();
    }
    expect(chunkIdFor(5, 6)).toBe("5");
    for (const [index, count] of [[0, 0], [0, 7], [-1, 1], [1, 1], [0, 1.5]]) {
      expect(() => chunkIdFor(index, count)).toThrow();
    }
  });
});

describe("share lifecycle", () => {
  const active = { status: "active" as const, shareRevision: 1, sessionNumbers: [2], message: "" };

  it("creates revision 1, then treats a repeated identical send as a no-op", () => {
    expect(planShare(null, { sessionNumber: 2, message: " Read p.2 " })).toEqual({ kind: "create", shareRevision: 1, sessionNumbers: [2], message: "Read p.2" });
    expect(planShare(active, { sessionNumber: 2, message: "" })).toEqual({ kind: "noop" });
  });

  it("adds session associations without a new revision (never a new opening)", () => {
    expect(planShare(active, { sessionNumber: 5, message: "" })).toEqual({ kind: "update-metadata", sessionNumbers: [2, 5], message: "" });
  });

  it("starts a new revision when re-sharing a revoked version", () => {
    expect(planShare({ ...active, status: "revoked", shareRevision: 3 }, { sessionNumber: 4, message: "" }))
      .toEqual({ kind: "reactivate", shareRevision: 4, sessionNumbers: [4], message: "" });
    expect(planRevoke({ status: "active" })).toEqual({ kind: "revoke" });
    expect(planRevoke({ status: "revoked" })).toEqual({ kind: "noop" });
    expect(planRevoke(null)).toEqual({ kind: "noop" });
  });

  it("bounds and deduplicates session numbers", () => {
    expect(normalizeSessionNumbers([3, 3, 1, 0, 26, 2.5, "4"])).toEqual([1, 3]);
  });

  it("counts Opened only for the grant's current revision", () => {
    expect(planReceipt(null, 1)).toEqual({ kind: "create" });
    expect(planReceipt({ shareRevision: 1 }, 1)).toEqual({ kind: "touch" });
    expect(planReceipt({ shareRevision: 1 }, 2)).toEqual({ kind: "new-revision" });
    expect(planReceipt({ shareRevision: 3 }, 2)).toEqual({ kind: "stale" });
    expect(receiptCountsAsOpened({ shareRevision: 1, firstOpenedAtMs: 5 }, { status: "active", shareRevision: 1 })).toBe(true);
    expect(receiptCountsAsOpened({ shareRevision: 1, firstOpenedAtMs: 5 }, { status: "active", shareRevision: 2 })).toBe(false);
    expect(receiptCountsAsOpened({ shareRevision: 2, firstOpenedAtMs: 5 }, { status: "revoked", shareRevision: 2 })).toBe(false);
    expect(receiptCountsAsOpened(null, { status: "active", shareRevision: 1 })).toBe(false);
  });
});

describe("parsing and reader bounds", () => {
  const versionId = versionIdFor("r01-rates-and-returns", SHA);
  const grantData = {
    versionId, materialId: "r01-rates-and-returns", recipientUid: "student-1", status: "active", shareRevision: 1,
    sessionNumbers: [2], message: "", title: "Rates and Returns", readingNumber: 1, sourceEdition: 2026,
    pageCount: 3, byteSize: 1000, chunkCount: 1, sha256: SHA, sharedBy: "tutor", sharedAt: null, revokedAt: null,
  };

  it("parses a valid grant and rejects a retargeted one", () => {
    expect(parseGrant(versionId, "student-1", grantData)?.title).toBe("Rates and Returns");
    expect(parseGrant(versionId, "student-2", grantData)).toBeNull();
    expect(parseGrant(versionId, "student-1", { ...grantData, sha256: "b".repeat(64) })).toBeNull();
    expect(parseGrant(versionId, "student-1", { ...grantData, materialId: "other" })).toBeNull();
    expect(parseGrant(versionId, "student-1", { ...grantData, chunkCount: 2 })).toBeNull();
    expect(parseGrant(versionId, "student-1", { ...grantData, status: "pending" })).toBeNull();
  });

  it("clamps reader page and zoom and ignores another version's state", () => {
    expect(clampPage(9, 3)).toBe(3);
    expect(clampPage(-2, 3)).toBe(1);
    expect(clampZoom(10)).toBe(3);
    expect(clampZoom(0.1)).toBe(0.5);
    expect(sanitizeReaderPreference({ versionId, page: 7, zoom: 1.234, fitMode: "custom" }, versionId, 4))
      .toEqual({ versionId, page: 4, zoom: 1.23, fitMode: "custom" });
    expect(sanitizeReaderPreference({ versionId: "other", page: 1 }, versionId)).toBeNull();
  });

  it("sorts shares newest first", () => {
    const grant = (id: string, sharedAtMs: number | null) => ({ versionId: id, sharedAtMs }) as MaterialGrant;
    expect(sortShares([grant("a", 1), grant("b", 3), grant("c", null)]).map(item => item.versionId)).toEqual(["c", "b", "a"]);
  });
});
