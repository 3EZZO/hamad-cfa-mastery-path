/**
 * Executable permission suite for teaching materials, run only against the
 * local Auth/Firestore emulators with a `demo-` project:
 *
 *   npm run test:materials:emulator
 *
 * It signs in synthetic accounts with the real Firebase SDK, uploads a
 * synthetic PDF, and exercises the app's own service queries and writes
 * against firestore.rules. It refuses to run otherwise,
 * so it can never reach the live project.
 */
import { createHash } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { deleteApp, initializeApp, type FirebaseApp } from "firebase/app";
import { connectAuthEmulator, createUserWithEmailAndPassword, getAuth, signOut } from "firebase/auth";
import {
  Bytes, collection, collectionGroup, connectFirestoreEmulator, deleteDoc, doc, getDoc, getDocFromServer, getDocs, getFirestore,
  query, serverTimestamp, setDoc, terminate, updateDoc, where, writeBatch, type Firestore,
} from "firebase/firestore";
import { createTeachingMaterialService, materialRefs, publishMaterialVersion, type TeachingMaterialService } from "../../lib/cloudTeachingMaterials";
import { syntheticPdf } from "../../testFixtures/syntheticPdf";
import { MATERIAL_CHUNK_BYTES, MAX_MATERIAL_BYTES, splitIntoChunks, receiptCountsAsOpened, type TeachingMaterialVersion } from "./materialTypes";
import { teachingRunIdFor } from "../liveSession/teachingHost";
import type { LabeledMaterialGrant } from "./materialDetails";
import { buildLibraryEntries } from "./libraryModel";

const PROJECT = process.env.GCLOUD_PROJECT ?? "";
const FIRESTORE_HOST = process.env.FIRESTORE_EMULATOR_HOST ?? "";
const AUTH_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST ?? "";

// Fail closed: every endpoint must be an emulator of a demo project.
if (!PROJECT.startsWith("demo-") || !FIRESTORE_HOST || !AUTH_HOST) {
  throw new Error(
    "Emulator suite refused to start: run it through `npm run test:materials:emulator` " +
      "(demo- project with Auth and Firestore emulators).",
  );
}

const ROOT = "programs/project-202";
const DENIED = /permission-denied|unauthorized|unauthenticated/;

interface Actor {
  name: string;
  app: FirebaseApp;
  firestore: Firestore;
  uid: string;
  service: TeachingMaterialService;
}

const apps: FirebaseApp[] = [];
let counter = 0;

function hostPort(value: string): [string, number] {
  const [host, port] = value.split(":");
  return [host!, Number(port)];
}

async function actor(name: string, signIn = true): Promise<Actor> {
  const app = initializeApp({ apiKey: "demo-api-key", projectId: PROJECT, appId: "demo-app" }, `${name}-${++counter}`);
  apps.push(app);
  const auth = getAuth(app);
  connectAuthEmulator(auth, `http://${AUTH_HOST}`, { disableWarnings: true });
  const firestore = getFirestore(app);
  connectFirestoreEmulator(firestore, ...hostPort(FIRESTORE_HOST));
  let uid = "";
  if (signIn) {
    const credential = await createUserWithEmailAndPassword(auth, `${name}-${counter}@synthetic.test`, "synthetic-password-1");
    uid = credential.user.uid;
  }
  return {
    name, app, firestore, uid,
    service: createTeachingMaterialService({ firestore, currentUid: () => auth.currentUser?.uid ?? null }),
  };
}

/** Seeds a membership document as the emulator owner (bypasses rules). */
async function seedMember(uid: string, data: Record<string, boolean | string>) {
  const fields = Object.fromEntries(Object.entries(data).map(([key, value]) =>
    [key, typeof value === "boolean" ? { booleanValue: value } : { stringValue: value }]));
  const response = await fetch(
    `http://${FIRESTORE_HOST}/v1/projects/${PROJECT}/databases/(default)/documents/${ROOT}/members/${uid}`,
    { method: "PATCH", headers: { Authorization: "Bearer owner", "Content-Type": "application/json" }, body: JSON.stringify({ fields }) },
  );
  if (!response.ok) throw new Error(`Seeding member failed: ${response.status}`);
}

async function expectDenied(work: Promise<unknown>) {
  let error: unknown = null;
  try {
    await work;
  } catch (caught) {
    error = caught;
  }
  expect(error, "expected the request to be denied").not.toBeNull();
  expect(String((error as { code?: string }).code)).toMatch(DENIED);
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function chunkRead(who: Actor, version: TeachingMaterialVersion) {
  return getDocFromServer(materialRefs.chunk(who.firestore, version.versionId, 0, version.chunkCount));
}

/** Rules probes bypass service validation, but never emulator authorization. */
function publicationBatch(who: Actor, version: TeachingMaterialVersion, bytes: Uint8Array, omitIndex = -1) {
  const batch = writeBatch(who.firestore);
  const { createdAtMs: _time, ...manifest } = version;
  void _time;
  batch.set(materialRefs.version(who.firestore, version.versionId), {
    ...manifest, createdBy: who.uid, createdAt: serverTimestamp(),
  });
  splitIntoChunks(bytes).forEach((chunk, index) => {
    if (index === omitIndex) return;
    batch.set(materialRefs.chunk(who.firestore, version.versionId, index, version.chunkCount), {
      versionId: version.versionId, index, bytes: Bytes.fromUint8Array(chunk),
    });
  });
  return batch;
}

let tutor: Actor;
let student: Actor;
let otherStudent: Actor;
let outsider: Actor;
let inactive: Actor;
let unknownRole: Actor;
let anonymous: Actor;
let versionA: TeachingMaterialVersion;
let versionB: TeachingMaterialVersion;
let bytesA: Uint8Array;

beforeAll(async () => {
  [tutor, student, otherStudent, outsider, inactive, unknownRole, anonymous] = await Promise.all([
    actor("tutor"), actor("student"), actor("student-two"), actor("outsider"),
    actor("inactive"), actor("unknown-role"), actor("anonymous", false),
  ]);
  await seedMember(tutor.uid, { active: true, role: "tutor" });
  await seedMember(student.uid, { active: true, role: "student" });
  await seedMember(otherStudent.uid, { active: true, role: "student" });
  await seedMember(inactive.uid, { active: false, role: "student" });
  await seedMember(unknownRole.uid, { active: true, role: "admin" });
}, 60_000);

afterAll(async () => {
  for (const app of apps) {
    await signOut(getAuth(app)).catch(() => undefined);
    await terminate(getFirestore(app)).catch(() => undefined);
    await deleteApp(app).catch(() => undefined);
  }
});

async function awaitLabeledGrant(who: Actor, predicate: (items: LabeledMaterialGrant[]) => boolean) {
  return new Promise<LabeledMaterialGrant[]>((resolve, reject) => {
    const timeout = setTimeout(() => { stop(); reject(new Error("Timed out waiting for material details")); }, 12_000);
    const stop = who.service.subscribeMyActiveGrants(items => {
      if (predicate(items)) { clearTimeout(timeout); stop(); resolve(items); }
    }, error => { clearTimeout(timeout); stop(); reject(error); });
  });
}

describe("teaching materials: upload and publication (tutor)", () => {
  it("atomically publishes binary chunks, manifest and catalogue pointer", async () => {
    bytesA = syntheticPdf({ pages: 2, label: "Synthetic reading A" });
    const result = await publishMaterialVersion(tutor.service, {
      bytes: bytesA, sha256: sha256(bytesA), byteSize: bytesA.byteLength, pageCount: 2,
      title: "Synthetic Rates", readingNumber: 1,
    });
    versionA = result.version;
    expect(result.duplicate).toBe(false);
    expect(versionA.versionId).toBe(`r01-synthetic-rates-${sha256(bytesA)}`);
    expect(await tutor.service.getVersion(versionA.versionId)).toMatchObject({ pageCount: 2, byteSize: bytesA.byteLength });
    const materials = await tutor.service.listMaterials();
    expect(materials.find(item => item.materialId === "r01-synthetic-rates")?.currentVersionId).toBe(versionA.versionId);
    expect(await tutor.service.downloadVersionBytes(versionA)).toEqual(bytesA);
  });

  it("resolves identical bytes to the existing version (idempotent retry)", async () => {
    const again = await publishMaterialVersion(tutor.service, {
      bytes: bytesA, sha256: sha256(bytesA), byteSize: bytesA.byteLength, pageCount: 2,
      title: "Synthetic Rates", readingNumber: 1,
    });
    expect(again.duplicate).toBe(true);
    expect(again.version.versionId).toBe(versionA.versionId);
  });

  it("publishes another version without an external bucket", async () => {
    const bytes = syntheticPdf({ pages: 1, label: "Synthetic reading B" });
    const planned = tutor.service.planManifest({ sha256: sha256(bytes), byteSize: bytes.byteLength, pageCount: 1, title: "Synthetic Returns", readingNumber: 2 });
    expect(await tutor.service.getVersion(planned.versionId)).toBeNull();
    const result = await publishMaterialVersion(tutor.service, {
      bytes, sha256: planned.sha256, byteSize: bytes.byteLength, pageCount: 1, title: "Synthetic Returns", readingNumber: 2,
    });
    expect(result.duplicate).toBe(false);
    versionB = result.version;
  });

  it("never publishes a manifest for a cancelled upload", async () => {
    const bytes = syntheticPdf({ pages: 1, label: "Cancelled synthetic" });
    const controller = new AbortController();
    controller.abort();
    await expect(publishMaterialVersion(tutor.service, {
      bytes, sha256: sha256(bytes), byteSize: bytes.byteLength, pageCount: 1, title: "Cancelled", readingNumber: null,
    }, { signal: controller.signal })).rejects.toMatchObject({ code: "cancelled" });
    const planned = tutor.service.planManifest({ sha256: sha256(bytes), byteSize: bytes.byteLength, pageCount: 1, title: "Cancelled", readingNumber: null });
    expect(await tutor.service.getVersion(planned.versionId)).toBeNull();
  });

  it("creates a new version for replacement bytes without moving grants", async () => {
    const bytes = syntheticPdf({ pages: 3, label: "Synthetic reading A v2" });
    const result = await publishMaterialVersion(tutor.service, {
      bytes, sha256: sha256(bytes), byteSize: bytes.byteLength, pageCount: 3, title: "Synthetic Rates", readingNumber: 1,
    });
    expect(result.version.versionId).not.toBe(versionA.versionId);
    const materials = await tutor.service.listMaterials();
    expect(materials.find(item => item.materialId === "r01-synthetic-rates")?.currentVersionId).toBe(result.version.versionId);
    expect(await tutor.service.getVersion(versionA.versionId)).not.toBeNull();
  });
});

describe("teaching materials: immutable binary chunk rules", () => {
  const pdf = syntheticPdf({ label: "Rule probe" });

  it("denies publication from students, outsiders and anonymous users", async () => {
    const planned = tutor.service.planManifest({ sha256: sha256(pdf), byteSize: pdf.byteLength, pageCount: 1, title: "Rule probe", readingNumber: null });
    for (const who of [student, outsider, anonymous, inactive, unknownRole]) {
      await expectDenied(publicationBatch(who, planned, pdf).commit());
    }
  });

  it("rejects invalid manifests and chunk shape atomically", async () => {
    const planned = tutor.service.planManifest({ sha256: sha256(pdf), byteSize: pdf.byteLength, pageCount: 1, title: "Invalid probe", readingNumber: null });
    for (const change of [
      { contentType: "text/plain" }, { sha256: "0".repeat(64) }, { byteSize: MAX_MATERIAL_BYTES + 1 },
      { chunkCount: 2 }, { pageCount: 101 },
    ]) {
      await expectDenied(publicationBatch(tutor, { ...planned, ...change } as TeachingMaterialVersion, pdf).commit());
    }
    for (const fields of [{ index: 1 }, { bytes: "base64-is-not-binary" }, { bytes: Bytes.fromUint8Array(new Uint8Array(1)) }]) {
      const batch = publicationBatch(tutor, planned, pdf);
      batch.set(materialRefs.chunk(tutor.firestore, planned.versionId, 0, 1), {
        versionId: planned.versionId, index: 0, bytes: Bytes.fromUint8Array(pdf), ...fields,
      });
      await expectDenied(batch.commit());
    }
    expect(await tutor.service.getVersion(planned.versionId)).toBeNull();
    expect((await chunkRead(tutor, planned)).exists()).toBe(false);
  });

  it("rejects incomplete publication including a missing middle chunk", async () => {
    const bytes = new Uint8Array(MATERIAL_CHUNK_BYTES * 2 + 13);
    const planned = tutor.service.planManifest({ sha256: sha256(bytes), byteSize: bytes.length, pageCount: 1, title: "Missing middle", readingNumber: null });
    await expectDenied(publicationBatch(tutor, planned, bytes, 1).commit());
    expect(await tutor.service.getVersion(planned.versionId)).toBeNull();
    expect((await chunkRead(tutor, planned)).exists()).toBe(false);
    await expectDenied(setDoc(materialRefs.chunk(tutor.firestore, planned.versionId, 0, 3), {
      versionId: planned.versionId, index: 0, bytes: Bytes.fromUint8Array(bytes.subarray(0, MATERIAL_CHUNK_BYTES)),
    }));
  });

  it("round-trips the six-chunk 5 MiB maximum within rule access limits", async () => {
    const bytes = new Uint8Array(MAX_MATERIAL_BYTES);
    bytes.set(pdf);
    bytes[bytes.length - 1] = 255;
    const result = await publishMaterialVersion(tutor.service, {
      bytes, sha256: sha256(bytes), byteSize: bytes.length, pageCount: 1, title: "Maximum synthetic", readingNumber: null,
    });
    expect(result.version.chunkCount).toBe(6);
    expect(sha256(await tutor.service.downloadVersionBytes(result.version))).toBe(sha256(bytes));
    await tutor.service.shareVersion(result.version, student.uid, { sessionNumber: null, message: "" });
    expect(sha256(await student.service.downloadVersionBytes(result.version))).toBe(sha256(bytes));
    await tutor.service.revokeVersion(result.version.versionId, student.uid);
  });

  it("rejects corrupt input before publishing", async () => {
    const planned = tutor.service.planManifest({ sha256: "f".repeat(64), byteSize: pdf.length, pageCount: 1, title: "Corrupt input", readingNumber: null });
    await expect(tutor.service.publishVersion(planned, pdf)).rejects.toMatchObject({ code: "invalid-material" });
    expect(await tutor.service.getVersion(planned.versionId)).toBeNull();
  });

  it("denies overwrite, delete and chunk listing", async () => {
    const chunk = materialRefs.chunk(tutor.firestore, versionA.versionId, 0, versionA.chunkCount);
    await expectDenied(setDoc(chunk, { versionId: versionA.versionId, index: 0, bytes: Bytes.fromUint8Array(bytesA) }));
    await expectDenied(deleteDoc(chunk));
    await expectDenied(deleteDoc(materialRefs.version(tutor.firestore, versionA.versionId)));
    for (const who of [tutor, student]) {
      await expectDenied(getDocs(collection(materialRefs.version(who.firestore, versionA.versionId), "chunks")));
    }
  });
});

describe("teaching materials: no access without an active grant", () => {
  it("denies anonymous, non-member, inactive and unknown-role users everywhere", async () => {
    for (const who of [anonymous, outsider, inactive, unknownRole]) {
      await expectDenied(getDocs(materialRefs.materials(who.firestore)));
      await expectDenied(getDocs(materialRefs.versions(who.firestore)));
      await expectDenied(chunkRead(who, versionA));
      await expectDenied(getDoc(materialRefs.version(who.firestore, versionA.versionId)));
      if (who.uid) {
        await expectDenied(getDocs(materialRefs.activeGrants(who.firestore, who.uid)));
        await expectDenied(setDoc(doc(who.firestore, `${ROOT}/materialRecipients/${who.uid}/receipts/${versionA.versionId}`), {
          versionId: versionA.versionId, shareRevision: 1, firstOpenedAt: serverTimestamp(), lastOpenedAt: serverTimestamp(),
        }));
      }
    }
  });

  it("denies a student without a grant the catalogue, manifest, metadata and bytes", async () => {
    await expectDenied(getDocs(materialRefs.materials(student.firestore)));
    await expectDenied(getDoc(materialRefs.version(student.firestore, versionA.versionId)));
    await expectDenied(chunkRead(student, versionA));
    await expectDenied(getDoc(materialRefs.version(student.firestore, versionA.versionId)));
    await expect(student.service.downloadVersionBytes(versionA)).rejects.toMatchObject({ code: "permission-denied" });
  });

  it("denies a student creating or self-activating a grant", async () => {
    await expectDenied(setDoc(materialRefs.grant(student.firestore, student.uid, versionA.versionId), {
      versionId: versionA.versionId, materialId: versionA.materialId, recipientUid: student.uid, status: "active",
      shareRevision: 1, sessionNumbers: [], message: "", title: versionA.title, readingNumber: versionA.readingNumber,
      sourceEdition: versionA.sourceEdition, pageCount: versionA.pageCount, byteSize: versionA.byteSize,
      sha256: versionA.sha256, chunkCount: versionA.chunkCount, sharedBy: student.uid, sharedAt: serverTimestamp(), revokedAt: null,
    }));
  });
});

describe("teaching materials: grants enforce exact recipient and version", () => {
  it("rejects grants to inactive recipients, missing versions and mismatched metadata", async () => {
    await expect(tutor.service.shareVersion(versionA, inactive.uid, { sessionNumber: 2, message: "" }))
      .rejects.toMatchObject({ code: "permission-denied" });
    await expect(tutor.service.shareVersion({ ...versionA, title: "Tampered title" }, student.uid, { sessionNumber: 2, message: "" }))
      .rejects.toMatchObject({ code: "permission-denied" });
    const ghost = { ...versionA, versionId: `r01-ghost-${"a".repeat(64)}`, materialId: "r01-ghost", sha256: "a".repeat(64) };
    await expect(tutor.service.shareVersion(ghost, student.uid, { sessionNumber: 2, message: "" }))
      .rejects.toMatchObject({ code: "permission-denied" });
  });

  it("an active grant unlocks exactly its recipient and version", async () => {
    expect(await tutor.service.shareVersion(versionA, student.uid, { sessionNumber: 2, message: "Read before Saturday." })).toBe("create");
    expect(await student.service.downloadVersionBytes(versionA)).toEqual(bytesA);
    await expectDenied(chunkRead(student, versionB));
    await expectDenied(chunkRead(otherStudent, versionA));
    // Another student's grant for version B unlocks neither A for them nor B for the first student.
    expect(await tutor.service.shareVersion(versionB, otherStudent.uid, { sessionNumber: 3, message: "" })).toBe("create");
    await expectDenied(chunkRead(otherStudent, versionA));
    await expectDenied(chunkRead(student, versionB));
  });

  it("a repeated send is idempotent and never resets an opened receipt", async () => {
    expect(await student.service.recordOpened(versionA.versionId, 1)).toBe("create");
    expect(await tutor.service.shareVersion(versionA, student.uid, { sessionNumber: 2, message: "" })).toBe("noop");
    expect(await tutor.service.shareVersion(versionA, student.uid, { sessionNumber: 4, message: "" })).toBe("update-metadata");
    const grant = (await getDoc(materialRefs.grant(tutor.firestore, student.uid, versionA.versionId))).data()!;
    expect(grant.shareRevision).toBe(1);
    expect(grant.sessionNumbers).toEqual([2, 4]);
    const receipt = (await getDoc(materialRefs.receipt(tutor.firestore, student.uid, versionA.versionId))).data()!;
    expect(receipt.shareRevision).toBe(1);
  });

  it("denies a student editing status, recipient, version, metadata, sessions or message", async () => {
    const grantRef = materialRefs.grant(student.firestore, student.uid, versionA.versionId);
    for (const change of [
      { status: "revoked" }, { recipientUid: otherStudent.uid }, { versionId: versionB.versionId },
      { title: "Changed" }, { sessionNumbers: [1] }, { message: "Edited" }, { shareRevision: 9 },
    ]) {
      await expectDenied(updateDoc(grantRef, change));
    }
  });

  it("students list only their own active shares with the client query", async () => {
    const own = await getDocs(materialRefs.activeGrants(student.firestore, student.uid));
    expect(own.docs.map(item => item.id)).toEqual([versionA.versionId]);
    await expectDenied(getDocs(materialRefs.grants(student.firestore, student.uid)));
    await expectDenied(getDocs(materialRefs.activeGrants(student.firestore, otherStudent.uid)));
    await expectDenied(getDocs(query(collectionGroup(student.firestore, "grants"), where("status", "==", "active"))));
    const seen = await new Promise<string[]>((resolve, reject) => {
      const stop = student.service.subscribeMyActiveGrants(grants => { stop(); resolve(grants.map(item => item.versionId)); }, reject);
    });
    expect(seen).toEqual([versionA.versionId]);
  });
});

describe("teaching materials: revocation and re-share revisions", () => {
  it("revocation denies future downloads, receipts and reader state", async () => {
    await student.service.saveReaderPreference({ versionId: versionA.versionId, page: 2, zoom: 1.25, fitMode: "custom" }, 2);
    expect(await tutor.service.revokeVersion(versionA.versionId, student.uid)).toBe("revoke");
    expect(await tutor.service.revokeVersion(versionA.versionId, student.uid)).toBe("noop");
    await expectDenied(chunkRead(student, versionA));
    await expect(student.service.recordOpened(versionA.versionId, 1)).rejects.toMatchObject({ code: "permission-denied" });
    await expect(student.service.loadReaderPreference(versionA.versionId, 2)).rejects.toMatchObject({ code: "permission-denied" });
    const active = await getDocs(materialRefs.activeGrants(student.firestore, student.uid));
    expect(active.size).toBe(0);
    const watched = await new Promise(resolve => {
      const stop = student.service.watchMyGrant(versionA.versionId, grant => { stop(); resolve(grant); });
    });
    expect(watched).toBeNull();
  });

  it("re-sharing starts a new revision; the old receipt does not count and stale writes fail", async () => {
    expect(await tutor.service.shareVersion(versionA, student.uid, { sessionNumber: 5, message: "" })).toBe("reactivate");
    const grantSnapshot = (await getDoc(materialRefs.grant(tutor.firestore, student.uid, versionA.versionId))).data()!;
    expect(grantSnapshot.shareRevision).toBe(2);
    const oldReceipt = (await getDoc(materialRefs.receipt(tutor.firestore, student.uid, versionA.versionId))).data()!;
    expect(receiptCountsAsOpened({ shareRevision: oldReceipt.shareRevision, firstOpenedAtMs: 1 }, { status: "active", shareRevision: 2 })).toBe(false);
    // A stale tab still holding revision 1 cannot mark the new share opened.
    await expectDenied(setDoc(materialRefs.receipt(student.firestore, student.uid, versionA.versionId), {
      versionId: versionA.versionId, shareRevision: 1, firstOpenedAt: serverTimestamp(), lastOpenedAt: serverTimestamp(),
    }));
    expect(await student.service.recordOpened(versionA.versionId, 1)).toBe("stale");
    expect((await getDoc(materialRefs.receipt(tutor.firestore, student.uid, versionA.versionId))).data()!.shareRevision).toBe(1);
    expect(await student.service.recordOpened(versionA.versionId, 2)).toBe("new-revision");
    expect(await student.service.recordOpened(versionA.versionId, 2)).toBe("touch");
    const receipt = (await getDoc(materialRefs.receipt(tutor.firestore, student.uid, versionA.versionId))).data()!;
    expect(receipt.shareRevision).toBe(2);
    // Reader preference survives re-sharing the same immutable version.
    expect(await student.service.loadReaderPreference(versionA.versionId, 2)).toMatchObject({ page: 2, zoom: 1.25 });
  });

  it("a tutor can still revoke after the recipient becomes inactive", async () => {
    await seedMember(otherStudent.uid, { active: false, role: "student" });
    expect(await tutor.service.revokeVersion(versionB.versionId, otherStudent.uid)).toBe("revoke");
    await expect(tutor.service.shareVersion(versionB, otherStudent.uid, { sessionNumber: 3, message: "" }))
      .rejects.toMatchObject({ code: "permission-denied" });
    await seedMember(otherStudent.uid, { active: true, role: "student" });
  });
});

describe("teaching materials: private tutor records and independent reader state", () => {
  const runId = teachingRunIdFor(3);

  it("keeps the teaching envelope and notes owner-tutor only", async () => {
    const clock = { status: "paused" as const, durationMs: 9_000_000, elapsedBeforeRunMs: 120_000, runningSince: null, updatedAt: new Date().toISOString() };
    const envelope = await tutor.service.saveTeachingEnvelope({
      schemaVersion: 1, runId, sessionNumber: 3, rehearsal: false, status: "paused", clock, surface: "pdf",
      selectedVersionId: versionA.versionId, guidedRunId: null, history: [],
    }, 0);
    expect(envelope.revision).toBe(1);
    await expect(tutor.service.saveTeachingEnvelope({ ...envelope }, 0)).rejects.toMatchObject({ code: "conflict" });
    expect(await tutor.service.saveTeachingNote(runId, versionA.versionId, "Private: check his TWR intuition.", 0)).toBe(1);
    await expect(tutor.service.saveTeachingNote(runId, versionA.versionId, "Previous account's late save", 1, "different-owner"))
      .rejects.toMatchObject({ code: "authentication-required" });
    await expect(tutor.service.saveTeachingNote(runId, versionA.versionId, "late stale save", 0)).rejects.toMatchObject({ code: "conflict" });
    expect(await tutor.service.loadTeachingNote(runId, versionA.versionId)).toMatchObject({ revision: 1 });

    const envelopeRef = materialRefs.teachingRun(student.firestore, tutor.uid, runId);
    await expectDenied(getDoc(envelopeRef));
    await expectDenied(getDoc(materialRefs.teachingNote(student.firestore, tutor.uid, runId, versionA.versionId)));
    await expectDenied(getDocs(collection(student.firestore, `${ROOT}/tutorTeachingSessions/${tutor.uid}/runs`)));
    await expectDenied(setDoc(materialRefs.teachingRun(student.firestore, student.uid, runId), { ...envelope, ownerUid: student.uid }));
    // Rehearsal records are never accepted by the server.
    await expectDenied(setDoc(materialRefs.teachingRun(tutor.firestore, tutor.uid, teachingRunIdFor(4)), {
      ...envelope, runId: teachingRunIdFor(4), sessionNumber: 4, rehearsal: true, revision: 1,
    }));
  });

  it("keeps reader state per user; nobody reads another user's state", async () => {
    await tutor.service.saveReaderPreference({ versionId: versionA.versionId, page: 1, zoom: 2, fitMode: "custom" }, 2);
    expect(await tutor.service.loadReaderPreference(versionA.versionId, 2)).toMatchObject({ page: 1, zoom: 2 });
    expect(await student.service.loadReaderPreference(versionA.versionId, 2)).toMatchObject({ page: 2, zoom: 1.25 });
    await expectDenied(getDoc(materialRefs.readerState(tutor.firestore, student.uid, versionA.versionId)));
    await expectDenied(getDoc(materialRefs.readerState(otherStudent.firestore, student.uid, versionA.versionId)));
    await expectDenied(setDoc(materialRefs.readerState(student.firestore, student.uid, versionA.versionId), {
      versionId: versionA.versionId, page: 500, zoom: 9, fitMode: "custom", updatedAt: serverTimestamp(),
    }));
  });

  it("leaves the existing private boundaries intact", async () => {
    await expectDenied(getDoc(doc(student.firestore, `${ROOT}/tutorPrivate/notes`)));
    await expectDenied(setDoc(doc(tutor.firestore, `${ROOT}/members/${tutor.uid}`), { active: true, role: "tutor" }));
    await expectDenied(updateDoc(materialRefs.version(tutor.firestore, versionA.versionId), { title: "Rewritten" }));
    await expectDenied(getDocs(collection(student.firestore, `${ROOT}/materialRecipients/${student.uid}/receipts`)));
  });
});

describe("teaching materials: editable details and topic boundaries", () => {
  let version: TeachingMaterialVersion;
  const labels = { title: "Economics - Module 3 - Fiscal Policy", readingNumber: null, topic: "Economics" as const };

  it("corrects legacy uploads without rewriting PDFs, shares, receipts or private notes", async () => {
    // Exercise the missing-details case used by uploads made before this feature.
    const bytes = syntheticPdf({ pages: 2, label: "Legacy label correction fixture" });
    version = (await publishMaterialVersion(tutor.service, { bytes, sha256: sha256(bytes), byteSize: bytes.length,
      pageCount: 2, title: "Incorrect title", readingNumber: 99 })).version;
    const response = await fetch(`http://${FIRESTORE_HOST}/v1/projects/${PROJECT}/databases/(default)/documents/${ROOT}/teachingMaterialDetails/${version.versionId}`,
      { method: "DELETE", headers: { Authorization: "Bearer owner" } });
    expect(response.ok).toBe(true);
    await tutor.service.shareVersion(version, student.uid, { sessionNumber: 3, message: "Keep this message" });
    await student.service.recordOpened(version.versionId, 1);
    await student.service.saveReaderPreference({ versionId: version.versionId, page: 2, zoom: 1.5, fitMode: "custom" }, 2);
    await tutor.service.saveTeachingNote("session-03", version.versionId, "Keep this private note", 0);
    const grantRef = materialRefs.grant(tutor.firestore, student.uid, version.versionId);
    const receiptRef = materialRefs.receipt(tutor.firestore, student.uid, version.versionId);
    const beforeGrant = (await getDoc(grantRef)).data();
    const beforeReceipt = (await getDoc(receiptRef)).data();
    const live = awaitLabeledGrant(student, items => items.some(item => item.versionId === version.versionId && item.title === labels.title));
    expect(await tutor.service.saveDetails(version.versionId, labels, 0)).toMatchObject({ ...labels, revision: 1 });
    expect((await live).find(item => item.versionId === version.versionId)).toMatchObject({ ...labels, shareRevision: 1, sha256: version.sha256 });
    expect((await getDoc(grantRef)).data()).toEqual(beforeGrant);
    expect((await getDoc(receiptRef)).data()).toEqual(beforeReceipt);
    expect(await tutor.service.getVersion(version.versionId)).toMatchObject({ title: "Incorrect title", readingNumber: 99 });
    expect(await tutor.service.downloadVersionBytes(version)).toEqual(bytes);
    expect(await student.service.loadReaderPreference(version.versionId, 2)).toMatchObject({ page: 2, zoom: 1.5 });
    expect(await tutor.service.loadTeachingNote("session-03", version.versionId)).toMatchObject({ text: "Keep this private note", revision: 1 });
    expect((await tutor.service.listDetails()).find(item => item.versionId === version.versionId)?.topic).toBe("Economics");
  });

  it("shares corrected materials using their original immutable source version", async () => {
    const entry = buildLibraryEntries(await tutor.service.listMaterials(), await tutor.service.listVersions(), await tutor.service.listDetails())
      .find(item => item.version.versionId === version.versionId)!;
    expect(entry.version.title).toBe(labels.title);
    expect(entry.sourceVersion.title).toBe("Incorrect title");
    expect(await tutor.service.shareVersion(entry.sourceVersion, otherStudent.uid, { sessionNumber: 4, message: "" })).toBe("create");
    const items = await awaitLabeledGrant(otherStudent, items => items.some(item => item.versionId === version.versionId && item.title === labels.title));
    expect(items.find(item => item.versionId === version.versionId)).toMatchObject({ topic: "Economics", readingNumber: null });
    expect(await otherStudent.service.downloadVersionBytes(version)).toEqual(await tutor.service.downloadVersionBytes(version));
  });

  it("rejects stale and concurrent edits rather than overwriting another device", async () => {
    const results = await Promise.allSettled([
      tutor.service.saveDetails(version.versionId, { ...labels, title: "Corrected A" }, 1),
      tutor.service.saveDetails(version.versionId, { ...labels, title: "Corrected B" }, 1),
    ]);
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
    const failure = results.find(result => result.status === "rejected") as PromiseRejectedResult;
    expect(failure.reason).toMatchObject({ code: "conflict" });
  });

  it("denies edits and unshared label reads to students and non-tutors", async () => {
    for (const who of [student, otherStudent, outsider, anonymous, inactive, unknownRole]) {
      await expectDenied(setDoc(materialRefs.detail(who.firestore, version.versionId), {
        versionId: version.versionId, ...labels, revision: 3, updatedBy: who.uid, updatedAt: serverTimestamp(),
      }));
      await expectDenied(getDocs(materialRefs.details(who.firestore)));
    }
    for (const who of [outsider, anonymous, inactive, unknownRole]) {
      await expectDenied(getDocFromServer(materialRefs.detail(who.firestore, version.versionId)));
    }
    await expectDenied(getDocFromServer(materialRefs.detail(student.firestore, versionB.versionId)));
    let seenBeforeRevoke = false;
    let ready!: () => void;
    const watching = new Promise<void>(resolve => { ready = resolve; });
    const liveRemoval = awaitLabeledGrant(student, items => {
      if (items.some(item => item.versionId === version.versionId)) { seenBeforeRevoke = true; ready(); return false; }
      return seenBeforeRevoke;
    });
    await watching;
    await tutor.service.revokeVersion(version.versionId, student.uid);
    await liveRemoval;
    await expectDenied(getDocFromServer(materialRefs.detail(student.firestore, version.versionId)));
    await expectDenied(chunkRead(student, version));
  });

  it("enforces allowed fields, bounded labels and monotonic revisions on direct SDK writes", async () => {
    const reference = materialRefs.detail(tutor.firestore, version.versionId);
    for (const patch of [{ title: "" }, { title: "a".repeat(161) }, { readingNumber: 100 }, { readingNumber: 1.5 },
      { topic: "Invented" }, { revision: 1 }, { sha256: "f".repeat(64) }, { versionId: versionB.versionId }]) {
      await expectDenied(updateDoc(reference, { revision: 3, updatedBy: tutor.uid, updatedAt: serverTimestamp(), ...patch }));
    }
    await expectDenied(deleteDoc(reference));
    await expect(tutor.service.saveDetails(version.versionId, { ...labels, title: " " }, 2)).rejects.toMatchObject({ code: "invalid-material" });
    await expect(tutor.service.saveDetails(version.versionId, { ...labels, readingNumber: 100 }, 2)).rejects.toMatchObject({ code: "invalid-material" });
  });
});
