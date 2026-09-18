import { useEffect, useState, useRef } from "react";
import {
  Banknote,
  CalendarDays,
  Check,
  ChevronRight,
  Clock,
  Download,
  FileText,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import {
  getPaymentConfig,
  savePaymentConfig,
  listPaymentRecords,
  savePaymentRecord,
  deletePaymentRecord,
  savePaymentReceipt,
  getPaymentReceipt,
  type PaymentConfig,
  type PaymentRecord,
} from "../../lib/cloudPayments";
import { generatePaymentReceipt } from "./ReceiptGenerator";
import { todayDateOnly, formatDate } from "../../lib/dates";
import { useTrackerSync } from "../../hooks/useTrackerSync";
import "./payments.css";

function makeId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function PaymentsHub() {
  const { user, member } = useTrackerSync();
  const [config, setConfig] = useState<PaymentConfig | null>(null);
  const [records, setRecords] = useState<PaymentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingRecord, setEditingRecord] = useState<PaymentRecord | null>(null);
  const [showConfig, setShowConfig] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [filter, setFilter] = useState<"all" | "paid" | "pending" | "overdue">("all");

  const tutorUid = user?.uid;
  // Currently we use a hardcoded student UID or derived. We know there's one student.
  // Wait, we can list members, or for now assume the tutor manages "the student".
  // Since we don't have the student uid easily, let's use a standard string for the single student context.
  const studentUid = "student-001"; // Placeholder for the 1:1 engagement

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      let cfg = await getPaymentConfig(studentUid);
      if (!cfg) {
        // Seed initial data
        cfg = {
          studentUid,
          studentName: "Mohamed",
          monthlyAmount: 1400,
          currency: "USD",
          engagementStartDate: "2026-09-18",
          engagementEndDate: "2027-02-26",
          billingDayOfMonth: 18,
        };
        await savePaymentConfig(cfg);
        
        const initialRecord: PaymentRecord = {
          id: makeId(),
          studentUid,
          dateRecorded: "2026-09-18",
          amount: 1400,
          status: "paid",
          hasReceipt: false,
        };
        await savePaymentRecord(initialRecord);
      }
      setConfig(cfg);
      const recs = await listPaymentRecords(studentUid);
      setRecords(recs);
    } catch (e: any) {
      console.error(e);
      setError(e.message || String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (member?.role === "tutor") {
      void loadData();
    }
  }, [member?.role]);

  if (!member || member.role !== "tutor") {
    return (
      <div className="empty-state">
        <Banknote size={24} />
        <strong>Tutor access required</strong>
        <p>This payment tracking hub is only available to the active tutor.</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="empty-state">
        <Banknote size={24} />
        <strong>Error loading payments</strong>
        <p>{error}</p>
        <button className="button button-primary" onClick={loadData}>Retry</button>
      </div>
    );
  }

  if (loading || !config) {
    return <div className="payments-loading">Loading payment records...</div>;
  }

  // Next payment calculation
  const today = new Date(todayDateOnly());
  const start = new Date(config.engagementStartDate);
  const end = new Date(config.engagementEndDate);
  
  let nextDueDate = new Date(start);
  while (nextDueDate < today) {
    nextDueDate.setMonth(nextDueDate.getMonth() + 1);
  }
  if (nextDueDate > end) nextDueDate = end; // Last payment is at the end of the engagement
  
  const daysUntilDue = Math.ceil((nextDueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  const isOverdue = daysUntilDue < 0; // Wait, nextDueDate is strictly >= today because of the loop.
  // Actually, let's find the current month's due date.
  let currentDue = new Date(today.getFullYear(), today.getMonth(), config.billingDayOfMonth);
  if (currentDue > today) {
    currentDue.setMonth(currentDue.getMonth() - 1); // Last due date
  }
  const expectedPayments = Math.max(1, Math.floor((today.getTime() - start.getTime()) / (1000 * 60 * 60 * 24 * 30)) + 1);
  const totalPaid = records.filter(r => r.status === "paid").reduce((sum, r) => sum + r.amount, 0);
  const expectedTotal = expectedPayments * config.monthlyAmount;

  const handleSaveRecord = async (record: PaymentRecord, fileDataUri?: string) => {
    await savePaymentRecord(record);
    if (fileDataUri) {
      await savePaymentReceipt(record.id, fileDataUri);
    }
    await loadData();
    setEditingRecord(null);
  };

  const handleDeleteRecord = async (id: string) => {
    if (!confirm("Delete this payment record?")) return;
    await deletePaymentRecord(id);
    await loadData();
  };

  const downloadStudentReceipt = (record: PaymentRecord) => {
    const blob = generatePaymentReceipt(user?.displayName || "Tutor", config, record);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Receipt_${record.dateRecorded}_${record.amount}.pdf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const openUploadedReceipt = async (paymentId: string) => {
    const receipt = await getPaymentReceipt(paymentId);
    if (receipt?.dataUri) {
      const w = window.open();
      if (w) {
        w.document.write(`<iframe src="${receipt.dataUri}" frameborder="0" style="border:0; top:0px; left:0px; bottom:0px; right:0px; width:100%; height:100%;" allowfullscreen></iframe>`);
      }
    } else {
      alert("Receipt file not found.");
    }
  };

  const filteredRecords = records.filter(r => filter === "all" || r.status === filter);

  return (
    <div className="payments-hub">
      <div className="payments-header">
        <div>
          <h2>Tutor Payments</h2>
          <p>Track engagement income and issue receipts.</p>
        </div>
        <button className="button button-primary" onClick={() => setEditingRecord({
          id: makeId(),
          studentUid,
          dateRecorded: todayDateOnly(),
          amount: config.monthlyAmount,
          status: "paid",
          hasReceipt: false,
        })}>
          <Plus size={16} /> Log Payment
        </button>
      </div>

      <div className="payments-metrics">
        <div className="metric-card">
          <span>Expected So Far</span>
          <strong>{config.currency} {expectedTotal.toLocaleString()}</strong>
        </div>
        <div className="metric-card">
          <span>Total Paid</span>
          <strong>{config.currency} {totalPaid.toLocaleString()}</strong>
        </div>
        <div className="metric-card">
          <span>Next Billing Date</span>
          <strong>{formatDate(nextDueDate.toISOString(), { day: "numeric", month: "short" })}</strong>
        </div>
      </div>

      {daysUntilDue <= 3 && daysUntilDue >= 0 && (
        <div className="payments-banner warning">
          <CalendarDays size={18} />
          <span>Payment due in {daysUntilDue} day{daysUntilDue === 1 ? '' : 's'}. Consider sending a WhatsApp reminder to {config.studentName}.</span>
        </div>
      )}

      {expectedTotal > totalPaid && (
        <div className="payments-banner danger">
          <Clock size={18} />
          <span>There is an overdue balance of {config.currency} {(expectedTotal - totalPaid).toLocaleString()}.</span>
        </div>
      )}

      <div className="payments-list-section">
        <div className="list-controls">
          <select value={filter} onChange={e => setFilter(e.target.value as any)}>
            <option value="all">All Payments</option>
            <option value="paid">Paid</option>
            <option value="pending">Pending</option>
            <option value="overdue">Overdue</option>
          </select>
        </div>

        {filteredRecords.length === 0 ? (
          <div className="empty-state">
            <Banknote size={24} />
            <strong>No payment records</strong>
            <p>You haven't logged any payments for this filter yet.</p>
          </div>
        ) : (
          <table className="payments-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Amount</th>
                <th>Status</th>
                <th>Notes</th>
                <th className="table-actions">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredRecords.map(record => (
                <tr key={record.id}>
                  <td>{formatDate(record.dateRecorded, { day: "numeric", month: "short", year: "numeric" })}</td>
                  <td>{config.currency} {record.amount.toLocaleString()}</td>
                  <td>
                    <span className={`status-badge status-${record.status}`}>{record.status}</span>
                  </td>
                  <td className="notes-col">{record.notes || "-"}</td>
                  <td className="table-actions">
                    {record.hasReceipt && (
                      <button className="icon-button" onClick={() => openUploadedReceipt(record.id)} title="View uploaded transfer receipt">
                        <FileText size={16} />
                      </button>
                    )}
                    <button className="icon-button" onClick={() => downloadStudentReceipt(record)} title="Generate PDF receipt for student">
                      <Download size={16} />
                    </button>
                    <button className="icon-button danger-text" onClick={() => handleDeleteRecord(record.id)} title="Delete record">
                      <Trash2 size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {editingRecord && (
        <PaymentModal 
          record={editingRecord}
          onClose={() => setEditingRecord(null)}
          onSave={handleSaveRecord}
        />
      )}
    </div>
  );
}

function PaymentModal({ record, onClose, onSave }: { record: PaymentRecord, onClose: () => void, onSave: (r: PaymentRecord, fileData?: string) => void }) {
  const [data, setData] = useState(record);
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    let dataUri: string | undefined = undefined;
    
    if (file) {
      if (file.size > 700000) {
        alert("File is too large. Please upload a smaller PDF (under 700KB).");
        setSaving(false);
        return;
      }
      dataUri = await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.readAsDataURL(file);
      });
      data.hasReceipt = true;
    }
    
    await onSave(data, dataUri);
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content payment-modal">
        <header className="modal-header">
          <h3>Log Payment</h3>
          <button className="icon-button" onClick={onClose} disabled={saving}><X size={18} /></button>
        </header>
        <div className="modal-body">
          <label>
            <span>Date Recorded</span>
            <input type="date" value={data.dateRecorded} onChange={e => setData({...data, dateRecorded: e.target.value})} disabled={saving} required />
          </label>
          <label>
            <span>Amount</span>
            <input type="number" value={data.amount} onChange={e => setData({...data, amount: Number(e.target.value)})} disabled={saving} required />
          </label>
          <label>
            <span>Status</span>
            <select value={data.status} onChange={e => setData({...data, status: e.target.value as any})} disabled={saving}>
              <option value="paid">Paid</option>
              <option value="pending">Pending</option>
              <option value="overdue">Overdue</option>
            </select>
          </label>
          <label>
            <span>Notes (Optional)</span>
            <input type="text" value={data.notes || ""} onChange={e => setData({...data, notes: e.target.value})} disabled={saving} placeholder="e.g. Bank transfer ref #1234" />
          </label>
          <label>
            <span>Transfer Receipt PDF (Optional)</span>
            <input type="file" accept="application/pdf" onChange={e => setFile(e.target.files?.[0] || null)} disabled={saving} />
            <small>Max size: 700KB</small>
          </label>
        </div>
        <footer className="modal-footer">
          <button className="button" onClick={onClose} disabled={saving}>Cancel</button>
          <button className="button button-primary" onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : "Save Payment"}
          </button>
        </footer>
      </div>
    </div>
  );
}
