export const RECEIPT_VERIFICATION_SCHEMA_VERSION = 1 as const;

export type ReceiptVerificationStatus = "active" | "revoked";

export interface PublicReceiptVerification {
  schemaVersion: typeof RECEIPT_VERIFICATION_SCHEMA_VERSION;
  token: string;
  paymentId: string;
  reference: string;
  studentName: string;
  tutorName: string;
  amount: number;
  currency: string;
  paymentDate: string;
  issuedAtClient: string;
  issuedBy: string;
  status: ReceiptVerificationStatus;
  revokedAtClient: string | null;
}

export interface ReceiptVerificationDraft {
  token: string;
  paymentId: string;
  studentName: string;
  tutorName: string;
  amount: number;
  currency: string;
  paymentDate: string;
  issuedAtClient: string;
  issuedBy: string;
}

const TOKEN_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredString(
  value: unknown,
  field: string,
  maximumLength: number,
): string {
  if (
    typeof value !== "string" ||
    value.trim().length === 0 ||
    value.length > maximumLength
  ) {
    throw new Error(`Receipt verification ${field} is invalid.`);
  }
  return value;
}

export function receiptReference(paymentId: string): string {
  return `RCPT-${paymentId.slice(0, 8).toUpperCase()}`;
}

export function isReceiptVerificationToken(value: string): boolean {
  return TOKEN_PATTERN.test(value);
}

export function createReceiptVerificationToken(): string {
  if (
    typeof crypto === "undefined" ||
    typeof crypto.randomUUID !== "function"
  ) {
    throw new Error(
      "Secure receipt verification requires a browser with Web Crypto support.",
    );
  }
  return crypto.randomUUID();
}

export function createPublicReceiptVerification(
  draft: ReceiptVerificationDraft,
): PublicReceiptVerification {
  return parsePublicReceiptVerification({
    ...draft,
    schemaVersion: RECEIPT_VERIFICATION_SCHEMA_VERSION,
    reference: receiptReference(draft.paymentId),
    status: "active",
    revokedAtClient: null,
  });
}

export function parsePublicReceiptVerification(
  value: unknown,
): PublicReceiptVerification {
  if (!isRecord(value) || value.schemaVersion !== 1) {
    throw new Error("Receipt verification record is invalid.");
  }

  const token = requiredString(value.token, "token", 80);
  if (!isReceiptVerificationToken(token)) {
    throw new Error("Receipt verification token is invalid.");
  }

  const paymentId = requiredString(value.paymentId, "payment ID", 100);
  const reference = requiredString(value.reference, "reference", 24);
  if (reference !== receiptReference(paymentId)) {
    throw new Error("Receipt verification reference is invalid.");
  }

  const amount = Number(value.amount);
  if (!Number.isFinite(amount) || amount <= 0 || amount > 1_000_000) {
    throw new Error("Receipt verification amount is invalid.");
  }

  const paymentDate = requiredString(value.paymentDate, "payment date", 10);
  if (!DATE_PATTERN.test(paymentDate)) {
    throw new Error("Receipt verification payment date is invalid.");
  }

  const issuedAtClient = requiredString(
    value.issuedAtClient,
    "issue time",
    40,
  );
  if (!Number.isFinite(Date.parse(issuedAtClient))) {
    throw new Error("Receipt verification issue time is invalid.");
  }

  if (value.status !== "active" && value.status !== "revoked") {
    throw new Error("Receipt verification status is invalid.");
  }

  const revokedAtClient = value.revokedAtClient;
  if (
    revokedAtClient !== null &&
    (typeof revokedAtClient !== "string" ||
      revokedAtClient.length > 40 ||
      !Number.isFinite(Date.parse(revokedAtClient)))
  ) {
    throw new Error("Receipt verification revocation time is invalid.");
  }
  if (
    (value.status === "active" && revokedAtClient !== null) ||
    (value.status === "revoked" && revokedAtClient === null)
  ) {
    throw new Error("Receipt verification revocation state is inconsistent.");
  }

  return {
    schemaVersion: RECEIPT_VERIFICATION_SCHEMA_VERSION,
    token,
    paymentId,
    reference,
    studentName: requiredString(value.studentName, "student name", 120),
    tutorName: requiredString(value.tutorName, "tutor name", 120),
    amount,
    currency: requiredString(value.currency, "currency", 12).toUpperCase(),
    paymentDate,
    issuedAtClient,
    issuedBy: requiredString(value.issuedBy, "issuer", 128),
    status: value.status,
    revokedAtClient,
  };
}

export function sameReceiptVerificationFacts(
  left: PublicReceiptVerification,
  right: PublicReceiptVerification,
): boolean {
  return (
    left.token === right.token &&
    left.paymentId === right.paymentId &&
    left.reference === right.reference &&
    left.studentName === right.studentName &&
    left.tutorName === right.tutorName &&
    left.amount === right.amount &&
    left.currency === right.currency &&
    left.paymentDate === right.paymentDate &&
    left.issuedBy === right.issuedBy
  );
}
