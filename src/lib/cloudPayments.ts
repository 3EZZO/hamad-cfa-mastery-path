import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  query,
  setDoc,
  where,
} from "firebase/firestore";
import { CloudClientError, getCloudConfigurationStatus, getCurrentCloudUser } from "./cloud";

const PROGRAM_ID = "project-202";

function getServices() {
  if (!getCloudConfigurationStatus().configured) {
    throw new CloudClientError("configuration-missing");
  }
  const user = getCurrentCloudUser();
  if (!user) {
    throw new CloudClientError("authentication-required");
  }
  return { firestore: getFirestore(), user };
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
  await deleteDoc(recordRef);
  try {
    const receiptRef = doc(firestore, "programs", PROGRAM_ID, "tutorPaymentReceipts", recordId);
    await deleteDoc(receiptRef); 
  } catch (e) {
    // ignore
  }
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
