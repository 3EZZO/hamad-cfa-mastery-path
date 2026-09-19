import { beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({
  documents: new Map<string, unknown>(),
  commitError: null as Error | null,
  deletes: [] as string[],
  updates: [] as Array<{ path: string; value: unknown }>,
}));

vi.mock("firebase/firestore", () => ({
  collection: (_firestore: unknown, ...segments: string[]) => ({
    path: segments.join("/"),
  }),
  doc: (_firestore: unknown, ...segments: string[]) => ({
    path: segments.join("/"),
  }),
  getDoc: async (reference: { path: string }) => ({
    exists: () => harness.documents.has(reference.path),
    data: () => structuredClone(harness.documents.get(reference.path)),
  }),
  getDocs: vi.fn(),
  query: vi.fn(),
  setDoc: vi.fn(),
  where: vi.fn(),
  writeBatch: () => ({
    delete: (reference: { path: string }) => {
      harness.deletes.push(reference.path);
    },
    set: vi.fn(),
    update: (reference: { path: string }, value: unknown) => {
      harness.updates.push({ path: reference.path, value });
    },
    commit: async () => {
      if (harness.commitError) throw harness.commitError;
    },
  }),
}));

vi.mock("./cloud", () => ({
  CloudClientError: class extends Error {},
  getCloudConfigurationStatus: () => ({ configured: true }),
  getCurrentCloudUser: () => ({ uid: "tutor-uid" }),
  getCloudFirestore: () => ({ kind: "fake-firestore" }),
}));

import {
  deletePaymentRecord,
  issuePaymentReceiptVerification,
} from "./cloudPayments";

describe("payment deletion", () => {
  beforeEach(() => {
    harness.documents.clear();
    harness.commitError = null;
    harness.deletes = [];
    harness.updates = [];
  });

  it("atomically deletes the record and attachment and revokes verification", async () => {
    const paymentPath =
      "programs/project-202/tutorPaymentRecords/payment-2026-09";
    const token = "123e4567-e89b-42d3-a456-426614174000";
    harness.documents.set(paymentPath, {
      id: "payment-2026-09",
      verificationToken: token,
    });
    harness.documents.set(
      `programs/project-202/publicReceiptVerifications/${token}`,
      { status: "active" },
    );

    await deletePaymentRecord("payment-2026-09");

    expect(harness.deletes).toEqual([
      "programs/project-202/tutorPaymentReceipts/payment-2026-09",
      paymentPath,
    ]);
    expect(harness.updates).toHaveLength(1);
    expect(harness.updates[0]?.value).toMatchObject({ status: "revoked" });
  });

  it("surfaces a failed atomic delete instead of silently succeeding", async () => {
    harness.commitError = new Error("permission-denied");
    await expect(deletePaymentRecord("payment-2026-09")).rejects.toThrow(
      "permission-denied",
    );
  });

  it("does not issue a receipt for an unpaid transaction", async () => {
    await expect(
      issuePaymentReceiptVerification(
        {
          id: "payment-2026-09",
          studentUid: "student-uid",
          dateRecorded: "2026-09-19",
          amount: 1500,
          status: "pending",
          hasReceipt: false,
        },
        {
          studentUid: "student-uid",
          studentName: "Hamad",
          monthlyAmount: 1500,
          currency: "USD",
          engagementStartDate: "2026-09-01",
          engagementEndDate: "2027-02-26",
          billingDayOfMonth: 19,
        },
        "Mohamed Ali",
      ),
    ).rejects.toThrow("Only a paid transaction");
  });
});
