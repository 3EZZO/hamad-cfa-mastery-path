import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPublicReceiptVerification } from "../../lib/receiptVerification";
import { ReceiptVerificationScreen } from "./ReceiptVerification";

const token = "123e4567-e89b-42d3-a456-426614174000";
const receipt = createPublicReceiptVerification({
  token,
  paymentId: "payment-september-2026",
  studentName: "Hamad",
  tutorName: "Mohamed Ali",
  amount: 1500,
  currency: "USD",
  paymentDate: "2026-09-19",
  issuedAtClient: "2026-09-19T10:00:00.000Z",
  issuedBy: "tutor-uid",
});

function text(tree: ReactTestRenderer): string {
  return JSON.stringify(tree.toJSON());
}

async function render(
  loadVerification: () => Promise<typeof receipt | null>,
  verificationToken = token,
) {
  let tree!: ReactTestRenderer;
  await act(async () => {
    tree = create(
      <ReceiptVerificationScreen
        token={verificationToken}
        loadVerification={loadVerification}
      />,
    );
    await Promise.resolve();
    await Promise.resolve();
  });
  return tree;
}

describe("receipt verification screen", () => {
  beforeEach(() => vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true));
  afterEach(() => vi.unstubAllGlobals());

  it("shows verified facts only after a matching ledger record loads", async () => {
    const tree = await render(async () => receipt);
    expect(text(tree)).toContain("Receipt verified");
    expect(text(tree)).toContain("RCPT-PAYMENT-");
    expect(text(tree)).toContain("Hamad");
    await act(async () => tree.unmount());
  });

  it("does not authenticate an unknown or malformed link", async () => {
    const missing = await render(async () => null);
    expect(text(missing)).toContain("Receipt not verified");
    await act(async () => missing.unmount());

    const loader = vi.fn(async () => receipt);
    const malformed = await render(loader, "not-a-valid-token");
    expect(text(malformed)).toContain("Receipt not verified");
    expect(loader).not.toHaveBeenCalled();
    await act(async () => malformed.unmount());
  });

  it("reports a lookup failure without making an authenticity decision", async () => {
    const tree = await render(async () => {
      throw new Error("offline");
    });
    expect(text(tree)).toContain("Verification unavailable");
    expect(text(tree)).toContain("No authenticity decision has been made");
    await act(async () => tree.unmount());
  });
});
