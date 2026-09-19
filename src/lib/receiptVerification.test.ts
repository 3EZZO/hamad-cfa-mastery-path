import { describe, expect, it } from "vitest";
import {
  createPublicReceiptVerification,
  parsePublicReceiptVerification,
  receiptReference,
  sameReceiptVerificationFacts,
} from "./receiptVerification";

const token = "123e4567-e89b-42d3-a456-426614174000";

function validReceipt() {
  return createPublicReceiptVerification({
    token,
    paymentId: "payment-september-2026",
    studentName: "Hamad",
    tutorName: "Mohamed Ali",
    amount: 1500,
    currency: "usd",
    paymentDate: "2026-09-19",
    issuedAtClient: "2026-09-19T10:00:00.000Z",
    issuedBy: "tutor-uid",
  });
}

describe("public receipt verification records", () => {
  it("creates a strict, minimal ledger record", () => {
    const receipt = validReceipt();
    expect(receipt.reference).toBe(receiptReference(receipt.paymentId));
    expect(receipt.currency).toBe("USD");
    expect(receipt.status).toBe("active");
    expect(receipt.revokedAtClient).toBeNull();
  });

  it("rejects altered or inconsistent verification records", () => {
    const receipt = validReceipt();
    expect(() =>
      parsePublicReceiptVerification({ ...receipt, reference: "RCPT-ALTERED" }),
    ).toThrow("reference is invalid");
    expect(() =>
      parsePublicReceiptVerification({ ...receipt, amount: 0 }),
    ).toThrow("amount is invalid");
    expect(() =>
      parsePublicReceiptVerification({ ...receipt, status: "revoked" }),
    ).toThrow("revocation state is inconsistent");
  });

  it("detects a changed payment fact while allowing a status transition", () => {
    const receipt = validReceipt();
    expect(
      sameReceiptVerificationFacts(receipt, {
        ...receipt,
        status: "revoked",
        revokedAtClient: "2026-09-20T10:00:00.000Z",
      }),
    ).toBe(true);
    expect(
      sameReceiptVerificationFacts(receipt, { ...receipt, amount: 1501 }),
    ).toBe(false);
  });
});
