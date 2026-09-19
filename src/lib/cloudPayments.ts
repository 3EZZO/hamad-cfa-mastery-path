import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  writeBatch,
  where,
} from "firebase/firestore";
import { CloudClientError, getCloudConfigurationStatus, getCurrentCloudUser, getCloudFirestore } from "./cloud";
import {
  createPublicReceiptVerification,
  createReceiptVerificationToken,
  isReceiptVerificationToken,
  parsePublicReceiptVerification,
  sameReceiptVerificationFacts,
  type PublicReceiptVerification,
} from "./receiptVerification";

const PROGRAM_ID = "project-202";

function getServices() {
  if (!getCloudConfigurationStatus().configured) {
    throw new CloudClientError("configuration-missing");
  }
  const user = getCurrentCloudUser();
  if (!user) {
    throw new CloudClientError("authentication-required");
  }
  return { firestore: getCloudFirestore(), user };
}

export interface PaymentConfig {
  studentUid: string;
  studentName: string;
  monthlyAmount: number;
  currency: string;
  engagementStartDate: string;
  engagementEndDate: string;
  billingDayOfMonth: number;
}

export interface PaymentRecord {
  id: string;
  studentUid: string;
  dateRecorded: string; // YYYY-MM-DD
  amount: number;
  status: "paid" | "pending" | "overdue";
  notes?: string;
  hasReceipt: boolean;
  verificationToken?: string;
  verificationIssuedAt?: string;
}

export interface PaymentReceipt {
  dataUri: string; // base64 encoded PDF
}

export async function getPaymentConfig(studentUid: string): Promise<PaymentConfig | null> {
  const { firestore } = getServices();
  const ref = doc(firestore, "programs", PROGRAM_ID, "tutorPaymentConfigs", studentUid);
  const snapshot = await getDoc(ref);
  if (!snapshot.exists()) return null;
  return snapshot.data() as PaymentConfig;
}

export async function savePaymentConfig(config: PaymentConfig): Promise<void> {
  const { firestore } = getServices();
  const ref = doc(firestore, "programs", PROGRAM_ID, "tutorPaymentConfigs", config.studentUid);
  await setDoc(ref, config);
}

export async function listPaymentRecords(studentUid: string): Promise<PaymentRecord[]> {
  const { firestore } = getServices();
  const recordsRef = collection(firestore, "programs", PROGRAM_ID, "tutorPaymentRecords");
  const q = query(recordsRef, where("studentUid", "==", studentUid));
  const snapshot = await getDocs(q);
  return snapshot.docs.map(doc => doc.data() as PaymentRecord).sort((a, b) => b.dateRecorded.localeCompare(a.dateRecorded));
}

export async function savePaymentRecord(record: PaymentRecord): Promise<void> {
  const { firestore } = getServices();
  const ref = doc(firestore, "programs", PROGRAM_ID, "tutorPaymentRecords", record.id);
  await setDoc(ref, record);
}

export async function deletePaymentRecord(recordId: string): Promise<void> {
  const { firestore } = getServices();
  const recordRef = doc(firestore, "programs", PROGRAM_ID, "tutorPaymentRecords", recordId);
  const receiptRef = doc(firestore, "programs", PROGRAM_ID, "tutorPaymentReceipts", recordId);
  const recordSnapshot = await getDoc(recordRef);
  const record = recordSnapshot.exists()
    ? (recordSnapshot.data() as PaymentRecord)
    : null;
  const batch = writeBatch(firestore);
  batch.delete(receiptRef);
  batch.delete(recordRef);
  if (
    record?.verificationToken &&
    isReceiptVerificationToken(record.verificationToken)
  ) {
    const verificationRef = doc(
      firestore,
      "programs",
      PROGRAM_ID,
      "publicReceiptVerifications",
      record.verificationToken,
    );
    const verificationSnapshot = await getDoc(verificationRef);
    if (verificationSnapshot.exists()) {
      batch.update(verificationRef, {
        status: "revoked",
        revokedAtClient: new Date().toISOString(),
      });
    }
  }
  await batch.commit();
}

export async function getPaymentReceipt(paymentId: string): Promise<PaymentReceipt | null> {
  const { firestore } = getServices();
  const ref = doc(firestore, "programs", PROGRAM_ID, "tutorPaymentReceipts", paymentId);
  const snapshot = await getDoc(ref);
  if (!snapshot.exists()) return null;
  return snapshot.data() as PaymentReceipt;
}

export async function savePaymentReceipt(paymentId: string, dataUri: string): Promise<void> {
  const { firestore } = getServices();
  const ref = doc(firestore, "programs", PROGRAM_ID, "tutorPaymentReceipts", paymentId);
  await setDoc(ref, { dataUri });
}

function publicReceiptVerificationDocument(token: string) {
  return doc(
    getCloudFirestore(),
    "programs",
    PROGRAM_ID,
    "publicReceiptVerifications",
    token,
  );
}

export async function getPublicReceiptVerification(
  token: string,
): Promise<PublicReceiptVerification | null> {
  if (!getCloudConfigurationStatus().configured) {
    throw new CloudClientError("configuration-missing");
  }
  if (!isReceiptVerificationToken(token)) return null;
  const snapshot = await getDoc(publicReceiptVerificationDocument(token));
  return snapshot.exists()
    ? parsePublicReceiptVerification(snapshot.data())
    : null;
}

export async function issuePaymentReceiptVerification(
  payment: PaymentRecord,
  config: PaymentConfig,
  tutorName: string,
): Promise<{
  payment: PaymentRecord;
  verification: PublicReceiptVerification;
}> {
  const { firestore, user } = getServices();
  if (payment.status !== "paid") {
    throw new Error(
      "Only a paid transaction can be issued as a verified receipt.",
    );
  }
  const token = payment.verificationToken ?? createReceiptVerificationToken();
  if (!isReceiptVerificationToken(token)) {
    throw new Error("The saved receipt verification token is invalid.");
  }

  const verificationRef = doc(
    firestore,
    "programs",
    PROGRAM_ID,
    "publicReceiptVerifications",
    token,
  );
  const existingSnapshot = await getDoc(verificationRef);
  let verification: PublicReceiptVerification;
  let shouldCreateVerification = false;

  if (existingSnapshot.exists()) {
    verification = parsePublicReceiptVerification(existingSnapshot.data());
    if (verification.status === "revoked") {
      throw new Error(
        "This receipt verification was revoked. Save the transaction to issue a new receipt.",
      );
    }
  } else {
    verification = createPublicReceiptVerification({
      token,
      paymentId: payment.id,
      studentName: config.studentName,
      tutorName,
      amount: payment.amount,
      currency: config.currency,
      paymentDate: payment.dateRecorded,
      issuedAtClient: payment.verificationIssuedAt ?? new Date().toISOString(),
      issuedBy: user.uid,
    });
    shouldCreateVerification = true;
  }

  const expected = createPublicReceiptVerification({
    token,
    paymentId: payment.id,
    studentName: verification.studentName,
    tutorName: verification.tutorName,
    amount: payment.amount,
    currency: verification.currency,
    paymentDate: payment.dateRecorded,
    issuedAtClient: verification.issuedAtClient,
    issuedBy: verification.issuedBy,
  });
  if (!sameReceiptVerificationFacts(verification, expected)) {
    throw new Error(
      "This transaction changed after its receipt was issued. Save it to revoke the old verification before printing again.",
    );
  }

  const updatedPayment: PaymentRecord = {
    ...payment,
    verificationToken: token,
    verificationIssuedAt: verification.issuedAtClient,
  };
  const paymentRef = doc(
    firestore,
    "programs",
    PROGRAM_ID,
    "tutorPaymentRecords",
    payment.id,
  );
  const batch = writeBatch(firestore);
  batch.set(paymentRef, updatedPayment);
  if (shouldCreateVerification) batch.set(verificationRef, verification);
  await batch.commit();
  return { payment: updatedPayment, verification };
}

export async function revokeReceiptVerification(token: string): Promise<void> {
  getServices();
  if (!isReceiptVerificationToken(token)) {
    throw new Error("The receipt verification token is invalid.");
  }
  const reference = publicReceiptVerificationDocument(token);
  const snapshot = await getDoc(reference);
  if (!snapshot.exists()) return;
  const verification = parsePublicReceiptVerification(snapshot.data());
  if (verification.status === "revoked") return;
  const batch = writeBatch(getCloudFirestore());
  batch.update(reference, {
    status: "revoked",
    revokedAtClient: new Date().toISOString(),
  });
  await batch.commit();
}
