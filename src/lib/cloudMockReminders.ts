import {
  Timestamp,
  addDoc,
  collection,
  doc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where,
  type DocumentData,
} from "firebase/firestore";
import {
  CloudClientError,
  getCloudConfigurationStatus,
  getCloudFirestore,
  getCurrentCloudUser,
  mapCloudError,
} from "./cloud";
import { validateReminderDraft, type MockReminder, type ReminderDraft } from "./mockReminders";

const PROGRAM_ID = "project-202";
const COLLECTION = "mockReminders";

function services() {
  if (!getCloudConfigurationStatus().configured) throw new CloudClientError("configuration-missing");
  const user = getCurrentCloudUser();
  if (!user) throw new CloudClientError("authentication-required");
  return { firestore: getCloudFirestore(), user };
}

function remindersCollection() {
  return collection(getCloudFirestore(), "programs", PROGRAM_ID, COLLECTION);
}

function reminderRef(id: string) {
  return doc(getCloudFirestore(), "programs", PROGRAM_ID, COLLECTION, id);
}

function millis(value: unknown): number | null {
  return value instanceof Timestamp ? value.toMillis() : null;
}

export function parseMockReminder(id: string, data: DocumentData): MockReminder {
  return {
    id,
    studentUid: String(data.studentUid ?? ""),
    message: String(data.message ?? ""),
    deadline: typeof data.deadline === "string" ? data.deadline : null,
    moduleIds: Array.isArray(data.moduleIds) ? data.moduleIds.map(String) : [],
    status: data.status === "cancelled" ? "cancelled" : "active",
    // A pending server timestamp reads as null in the local echo; treat it as now.
    createdAtMs: millis(data.createdAt) ?? Date.now(),
    createdBy: String(data.createdBy ?? ""),
    editedAtMs: millis(data.editedAt),
    cancelledAtMs: millis(data.cancelledAt),
    seenAtMs: millis(data.seenAt),
    acknowledgedAtMs: millis(data.acknowledgedAt),
  };
}

function checkDraft(draft: ReminderDraft) {
  const problem = validateReminderDraft(draft);
  if (problem) throw new Error(problem);
  return {
    message: draft.message.trim(),
    deadline: draft.deadline,
    moduleIds: [...draft.moduleIds],
  };
}

// ---------------------------------------------------------------- tutor

export async function sendMockReminder(draft: ReminderDraft): Promise<void> {
  const fields = checkDraft(draft);
  try {
    const { user } = services();
    await addDoc(remindersCollection(), {
      studentUid: draft.studentUid,
      ...fields,
      status: "active",
      createdAt: serverTimestamp(),
      createdBy: user.uid,
      editedAt: null,
      cancelledAt: null,
      seenAt: null,
      acknowledgedAt: null,
    });
  } catch (error) {
    throw mapCloudError(error);
  }
}

/** Edit an active reminder. The student sees it again as a new message. */
export async function editMockReminder(id: string, draft: ReminderDraft): Promise<void> {
  const fields = checkDraft(draft);
  try {
    services();
    await updateDoc(reminderRef(id), {
      ...fields,
      editedAt: serverTimestamp(),
      seenAt: null,
      acknowledgedAt: null,
    });
  } catch (error) {
    throw mapCloudError(error);
  }
}

export async function cancelMockReminder(id: string): Promise<void> {
  try {
    services();
    await updateDoc(reminderRef(id), { status: "cancelled", cancelledAt: serverTimestamp() });
  } catch (error) {
    throw mapCloudError(error);
  }
}

export async function listMockReminders(): Promise<MockReminder[]> {
  try {
    services();
    const snapshot = await getDocs(remindersCollection());
    return snapshot.docs
      .map(item => parseMockReminder(item.id, item.data()))
      .sort((a, b) => b.createdAtMs - a.createdAtMs);
  } catch (error) {
    throw mapCloudError(error);
  }
}

// ---------------------------------------------------------------- student

/** Live list of the student's active reminders. */
export function subscribeToMyMockReminders(
  uid: string,
  onChange: (reminders: MockReminder[]) => void,
  onError: (error: CloudClientError) => void,
): () => void {
  try {
    services();
    const mine = query(remindersCollection(), where("studentUid", "==", uid), where("status", "==", "active"));
    return onSnapshot(
      mine,
      snapshot => onChange(snapshot.docs.map(item => parseMockReminder(item.id, item.data()))),
      error => onError(mapCloudError(error)),
    );
  } catch (error) {
    onError(mapCloudError(error));
    return () => undefined;
  }
}

export async function markMockReminderSeen(id: string): Promise<void> {
  try {
    services();
    await updateDoc(reminderRef(id), { seenAt: serverTimestamp() });
  } catch (error) {
    throw mapCloudError(error);
  }
}

export async function acknowledgeMockReminder(id: string): Promise<void> {
  try {
    services();
    await updateDoc(reminderRef(id), { acknowledgedAt: serverTimestamp() });
  } catch (error) {
    throw mapCloudError(error);
  }
}
