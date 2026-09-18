const fs = require('fs');
const path = require('path');

const content = `
import React, { useState, useEffect } from "react";
import { Plus, Download, Search, Settings, FileText, CheckCircle2, CircleDashed, Clock, ChevronLeft, X, Printer, MessageCircle } from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { getPaymentConfig, savePaymentConfig, listPaymentRecords, savePaymentRecord, getPaymentReceipt, type PaymentConfig, type PaymentRecord } from "../../lib/cloudPayments";
import { generatePaymentReceipt } from "./ReceiptGenerator";
import { toDateOnly, todayDateOnly, formatDate } from "../../lib/dates";
import "./payments.css";

// Generate a random ID for new records
function makeId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).substring(2, 15);
}

export function PaymentsHub({ tutorName, studentUid }: { tutorName: string, studentUid: string }) {
  const [config, setConfig] = useState<PaymentConfig | null>(null);
  const [records, setRecords] = useState<PaymentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingRecord, setEditingRecord] = useState<PaymentRecord | null>(null);
  const [showConfig, setShowConfig] = useState(false);
  const [viewingReceipt, setViewingReceipt] = useState<{payment: PaymentRecord, blobUrl: string | null} | null>(null);

  useEffect(() => {
    let active = true;
    async function loadData() {
      try {
        let cfg = await getPaymentConfig(studentUid);
        if (!cfg) {
          cfg = {
            studentUid,
            studentName: "Hamad",
            monthlyAmount: 1800,
            currency: "USD",
            engagementStartDate: "2026-09-18",
            engagementEndDate: "2027-02-26",
            billingDayOfMonth: 18,
          };
          await savePaymentConfig(cfg);
        }
        if (!active) return;
        setConfig(cfg);
        const recs = await listPaymentRecords(studentUid);
        if (!active) return;
        setRecords(recs.sort((a, b) => b.dateRecorded.localeCompare(a.dateRecorded)));
      } catch (err: any) {
        console.error("Failed to load payment data:", err);
        if (active) setError(err.message || "Failed to load");
      } finally {
        if (active) setLoading(false);
      }
    }
    loadData();
    return () => { active = false; };
  }, [studentUid]);

  if (loading) return <div className="payments-hub loading">Loading financial dashboard...</div>;
  if (error) return <div className="payments-hub error"><h3>Error</h3><p>{error}</p></div>;
  if (!config) return null;

  const handleSaveRecord = async (rec: PaymentRecord, file: File | null) => {
    await savePaymentRecord(rec, file);
    setRecords(prev => {
      const idx = prev.findIndex(r => r.id === rec.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = rec;
        return next;
      }
      return [rec, ...prev].sort((a, b) => b.dateRecorded.localeCompare(a.dateRecorded));
    });
    setEditingRecord(null);
  };

  const downloadReceipt = (rec: PaymentRecord) => {
    const blob = generatePaymentReceipt(tutorName, config, rec);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = \`Receipt-\${rec.id.slice(0,8)}.pdf\`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handlePrintReceipt = (rec: PaymentRecord) => {
    setViewingReceipt({ payment: rec, blobUrl: null });
  };

  // Engagement calculations
  const totalPaid = records.filter(r => r.status === "paid").reduce((sum, r) => sum + r.amount, 0);
  const startObj = new Date(config.engagementStartDate);
  const endObj = new Date(config.engagementEndDate);
  const monthsDiff = (endObj.getFullYear() - startObj.getFullYear()) * 12 + (endObj.getMonth() - startObj.getMonth()) + 1;
  const expectedTotal = config.monthlyAmount * Math.max(1, monthsDiff);
  
  const today = new Date();
  let nextBillingDate = new Date(today.getFullYear(), today.getMonth(), config.billingDayOfMonth);
  if (nextBillingDate <= today) {
    nextBillingDate.setMonth(nextBillingDate.getMonth() + 1);
  }
  const daysUntilDue = Math.ceil((nextBillingDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

  const progressPct = Math.min(100, Math.round((totalPaid / expectedTotal) * 100)) || 0;

  // Generate Chart Data
  const chartData = [];
  let cumulativeExpected = 0;
  let cumulativeActual = 0;
  let currentM = new Date(startObj);
  while (currentM <= endObj || chartData.length < monthsDiff) {
    cumulativeExpected += config.monthlyAmount;
    
    // Find payments in this month
    const mStr = currentM.toISOString().slice(0, 7); // YYYY-MM
    const paidThisMonth = records.filter(r => r.status === "paid" && r.dateRecorded.startsWith(mStr)).reduce((s, r) => s + r.amount, 0);
    cumulativeActual += paidThisMonth;

    chartData.push({
      month: currentM.toLocaleString('default', { month: 'short' }),
      Expected: cumulativeExpected,
      Actual: cumulativeActual
    });
    currentM.setMonth(currentM.getMonth() + 1);
  }

  // WhatsApp Link Generation
  const waMessage = encodeURIComponent(\`Hello \${config.studentName}, this is a gentle reminder that your next CFA tutoring payment of \${config.currency} \${config.monthlyAmount.toLocaleString()} is due on \${nextBillingDate.toLocaleDateString()}. Thank you for your continued dedication!\`);
  const waLink = \`https://wa.me/?text=\${waMessage}\`;

  // Determine if Print View is active
  if (viewingReceipt) {
    return (
      <ReceiptPrintView 
        tutorName={tutorName} 
        config={config} 
        payment={viewingReceipt.payment} 
        onClose={() => setViewingReceipt(null)} 
      />
    );
  }

  return (
    <div className="payments-hub luxury-dashboard">
      <header className="dashboard-header">
        <div>
          <h2 className="gradient-text">Financial Command Center</h2>
          <p>Real-time engagement revenue and printable invoicing.</p>
        </div>
        <div className="header-actions">
          <button className="luxury-btn icon-only outline" onClick={() => setShowConfig(true)} title="Settings">
            <Settings size={18} />
          </button>
          <button className="luxury-btn primary" onClick={() => setEditingRecord({
            id: makeId(),
            studentUid,
            dateRecorded: todayDateOnly(),
            amount: config.monthlyAmount,
            status: "paid",
            hasReceipt: false,
          })}>
            <Plus size={16} /> Log Transaction
          </button>
        </div>
      </header>

      {/* Metrics Row */}
      <div className="metrics-grid">
        <div className="glass-card metric-card">
          <div className="metric-icon teal"><CheckCircle2 size={24} /></div>
          <div className="metric-data">
            <span>Total Collected</span>
            <strong className="text-teal">{config.currency} {totalPaid.toLocaleString()}</strong>
            <small>of {expectedTotal.toLocaleString()} Expected</small>
          </div>
          <div className="progress-ring-container">
             <svg viewBox="0 0 36 36" className="circular-chart teal">
                <path className="circle-bg"
                  d="M18 2.0845
                    a 15.9155 15.9155 0 0 1 0 31.831
                    a 15.9155 15.9155 0 0 1 0 -31.831"
                />
                <path className="circle"
                  strokeDasharray={\`\${progressPct}, 100\`}
                  d="M18 2.0845
                    a 15.9155 15.9155 0 0 1 0 31.831
                    a 15.9155 15.9155 0 0 1 0 -31.831"
                />
                <text x="18" y="20.35" className="percentage">{progressPct}%</text>
              </svg>
          </div>
        </div>

        <div className="glass-card metric-card">
          <div className="metric-icon gold"><Clock size={24} /></div>
          <div className="metric-data">
            <span>Next Payment Due</span>
            <strong className="text-gold">{formatDate(toDateOnly(nextBillingDate), { month: 'short', day: 'numeric' })}</strong>
            {daysUntilDue <= 3 ? (
              <small className="alert-text">Due in {daysUntilDue} days</small>
            ) : (
              <small>in {daysUntilDue} days</small>
            )}
          </div>
          <a href={waLink} target="_blank" rel="noreferrer" className="luxury-btn sm outline gold wa-btn">
            <MessageCircle size={14} /> Send Reminder
          </a>
        </div>
      </div>

      {/* Trajectory Chart */}
      <div className="glass-card chart-card">
        <h3>Income Trajectory</h3>
        <div className="chart-wrapper">
          <ResponsiveContainer width="100%" height={250}>
            <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="colorActual" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#00b49f" stopOpacity={0.8}/>
                  <stop offset="95%" stopColor="#00b49f" stopOpacity={0}/>
                </linearGradient>
                <linearGradient id="colorExpected" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#eab355" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="#eab355" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <XAxis dataKey="month" stroke="#a9bacd" fontSize={12} tickLine={false} axisLine={false} />
              <YAxis stroke="#a9bacd" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(value) => \`\${value}\`} />
              <Tooltip 
                contentStyle={{ backgroundColor: '#13263b', border: '1px solid #3b5065', borderRadius: '8px', color: '#fff' }}
                itemStyle={{ color: '#fff' }}
              />
              <Area type="monotone" dataKey="Expected" stroke="#eab355" fillOpacity={1} fill="url(#colorExpected)" />
              <Area type="monotone" dataKey="Actual" stroke="#00b49f" fillOpacity={1} fill="url(#colorActual)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Interactive Transactions List */}
      <div className="glass-card transactions-card">
        <div className="transactions-header">
          <h3>Transaction History</h3>
          <span className="badge">{records.length} Records</span>
        </div>
        
        {records.length === 0 ? (
          <div className="empty-state">No payments logged yet.</div>
        ) : (
          <div className="transactions-list">
            {records.map(r => (
              <div key={r.id} className="transaction-row">
                <div className="t-icon">
                  {r.status === 'paid' ? <CheckCircle2 className="text-teal" size={20} /> : <CircleDashed className="text-gold" size={20} />}
                </div>
                <div className="t-details">
                  <h4>{config.currency} {r.amount.toLocaleString()}</h4>
                  <small>{formatDate(r.dateRecorded, { day: 'numeric', month: 'short', year: 'numeric' })} &bull; REF-{r.id.slice(0,6).toUpperCase()}</small>
                </div>
                <div className="t-status">
                  <span className={\`luxury-badge \${r.status}\`}>{r.status}</span>
                </div>
                <div className="t-actions">
                  <button className="luxury-btn outline sm" onClick={() => handlePrintReceipt(r)} title="Print Native Receipt">
                    <Printer size={14} /> Web Receipt
                  </button>
                  <button className="luxury-btn outline sm icon-only" onClick={() => downloadReceipt(r)} title="Download Legacy PDF">
                    <Download size={14} />
                  </button>
                  <button className="luxury-btn outline sm icon-only" onClick={() => setEditingRecord(r)} title="Edit">
                    <Settings size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {editingRecord && (
        <PaymentModal 
          record={editingRecord}
          onClose={() => setEditingRecord(null)}
          onSave={handleSaveRecord}
        />
      )}

      {showConfig && (
        <ConfigModal
          config={config}
          onClose={() => setShowConfig(false)}
          onSave={async (newConfig) => {
            await savePaymentConfig(newConfig);
            setConfig(newConfig);
            setShowConfig(false);
          }}
        />
      )}
    </div>
  );
}

// ==========================================
// RECEIPT PRINT VIEW (NATIVE HTML->PDF)
// ==========================================
function ReceiptPrintView({ tutorName, config, payment, onClose }: { tutorName: string, config: PaymentConfig, payment: PaymentRecord, onClose: () => void }) {
  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="receipt-print-view">
      <div className="receipt-controls no-print">
        <button className="luxury-btn outline" onClick={onClose}><ChevronLeft size={16} /> Back to Dashboard</button>
        <button className="luxury-btn primary" onClick={handlePrint}><Printer size={16} /> Save as PDF / Print</button>
      </div>

      <div className="receipt-document">
        <div className="receipt-top-accent"></div>
        <div className="receipt-header">
          <div className="r-left">
            <span className="r-project">PROJECT 202</span>
            <h1 className="r-title">{config.studentName}'s CFA Level I</h1>
            <h1 className="r-subtitle">Mastery System</h1>
          </div>
          <div className="r-right">
            <div className="r-pill">OFFICIAL RECEIPT</div>
          </div>
        </div>

        <p className="r-desc">
          This document serves as an official receipt of payment for the private tutoring engagement between the stated candidate and tutor.
        </p>

        <div className="r-main-card">
          <div className="r-mc-left">
            <label>AMOUNT PAID</label>
            <div className="r-amount">{config.currency} {payment.amount.toLocaleString()}</div>
          </div>
          <div className="r-mc-right">
            <div className="r-status-large">{payment.status === "paid" ? "PAID IN FULL" : payment.status.toUpperCase()}</div>
            <div className="r-meta">RECEIPT REF: RCPT-{payment.id.slice(0, 8).toUpperCase()}</div>
            <div className="r-meta">ISSUED: {formatDate(todayDateOnly(), { day: "numeric", month: "short", year: "numeric" }).toUpperCase()}</div>
          </div>
        </div>

        <div className="r-grid">
          <div className="r-box">
            <div className="r-box-val">{formatDate(payment.dateRecorded, { day: "numeric", month: "short", year: "numeric" })}</div>
            <div className="r-box-lbl">PAYMENT DATE</div>
          </div>
          <div className="r-box">
            <div className="r-box-val">
              {formatDate(config.engagementStartDate, { month: "short", year: "numeric" }).toUpperCase()} - {formatDate(config.engagementEndDate, { month: "short", year: "numeric" }).toUpperCase()}
            </div>
            <div className="r-box-lbl">ENGAGEMENT TERM</div>
          </div>
        </div>

        <div className="r-footer-details">
          <div className="r-party">
            <label>TUTOR</label>
            <strong>{tutorName}, CFA</strong>
          </div>
          <div className="r-party">
            <label>CANDIDATE</label>
            <strong>{config.studentName}</strong>
          </div>
        </div>

        <div className="r-separator"></div>

        <div className="r-notes">
          {payment.notes ? \`Notes: \${payment.notes}\` : "No additional notes."}
        </div>
      </div>
    </div>
  );
}

// ==========================================
// MODALS
// ==========================================

function PaymentModal({ record, onClose, onSave }: { record: PaymentRecord, onClose: () => void, onSave: (rec: PaymentRecord, file: File | null) => Promise<void> }) {
  const [data, setData] = useState(record);
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [existingPdfUrl, setExistingPdfUrl] = useState<string | null>(null);
  const [loadingPdf, setLoadingPdf] = useState(false);

  useEffect(() => {
    let active = true;
    if (record.hasReceipt && record.id) {
      setLoadingPdf(true);
      getPaymentReceipt(record.id).then(url => {
        if (active && url) setExistingPdfUrl(url);
        if (active) setLoadingPdf(false);
      });
    }
    return () => { active = false; };
  }, [record]);

  const handleSave = async () => {
    setSaving(true);
    await onSave(data, file);
  };

  return (
    <div className="modal-overlay luxury-modal">
      <div className="modal-content glass-card">
        <header className="modal-header">
          <h3>{record.hasReceipt ? "Edit Transaction" : "Log Transaction"}</h3>
          <button className="icon-button" onClick={onClose} disabled={saving}><X size={18} /></button>
        </header>
        <div className="modal-body glass-inputs">
          <label>
            <span>Date Recorded</span>
            <input type="date" value={data.dateRecorded} onChange={e => setData({...data, dateRecorded: e.target.value})} disabled={saving} />
          </label>
          <label>
            <span>Amount</span>
            <input type="number" value={data.amount} onChange={e => setData({...data, amount: Number(e.target.value)})} disabled={saving} />
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
            <input type="text" value={data.notes || ""} onChange={e => setData({...data, notes: e.target.value})} disabled={saving} placeholder="e.g. Bank transfer reference" />
          </label>
          
          <div className="receipt-upload-section">
            <label>
              <span>Bank Transfer Screenshot (PDF)</span>
              <input type="file" accept="application/pdf" onChange={e => setFile(e.target.files?.[0] || null)} disabled={saving} />
              <small>Max size: 700KB. Leave blank to keep existing.</small>
            </label>
            
            {loadingPdf && <p className="text-muted"><small>Loading existing transfer proof...</small></p>}
            {existingPdfUrl && (
              <div className="existing-receipt">
                <a href={existingPdfUrl} target="_blank" rel="noreferrer" className="luxury-btn outline sm"><FileText size={14}/> View Attached Proof</a>
              </div>
            )}
          </div>
        </div>
        <footer className="modal-footer">
          <button className="luxury-btn outline" onClick={onClose} disabled={saving}>Cancel</button>
          <button className="luxury-btn primary" onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : "Save Transaction"}
          </button>
        </footer>
      </div>
    </div>
  );
}

function ConfigModal({ config, onClose, onSave }: { config: PaymentConfig, onClose: () => void, onSave: (cfg: PaymentConfig) => void }) {
  const [data, setData] = useState(config);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    await onSave(data);
  };

  return (
    <div className="modal-overlay luxury-modal">
      <div className="modal-content glass-card">
        <header className="modal-header">
          <h3>Payment Settings</h3>
          <button className="icon-button" onClick={onClose} disabled={saving}><X size={18} /></button>
        </header>
        <div className="modal-body glass-inputs">
          <div className="input-grid">
            <label>
              <span>Student Name</span>
              <input type="text" value={data.studentName} onChange={e => setData({...data, studentName: e.target.value})} disabled={saving} />
            </label>
            <label>
              <span>Currency</span>
              <input type="text" value={data.currency} onChange={e => setData({...data, currency: e.target.value})} disabled={saving} />
            </label>
            <label>
              <span>Monthly Amount</span>
              <input type="number" value={data.monthlyAmount} onChange={e => setData({...data, monthlyAmount: Number(e.target.value)})} disabled={saving} />
            </label>
            <label>
              <span>Billing Day of Month</span>
              <input type="number" min={1} max={31} value={data.billingDayOfMonth} onChange={e => setData({...data, billingDayOfMonth: Number(e.target.value)})} disabled={saving} />
            </label>
            <label>
              <span>Engagement Start</span>
              <input type="date" value={data.engagementStartDate} onChange={e => setData({...data, engagementStartDate: e.target.value})} disabled={saving} />
            </label>
            <label>
              <span>Engagement End</span>
              <input type="date" value={data.engagementEndDate} onChange={e => setData({...data, engagementEndDate: e.target.value})} disabled={saving} />
            </label>
          </div>
        </div>
        <footer className="modal-footer">
          <button className="luxury-btn outline" onClick={onClose} disabled={saving}>Cancel</button>
          <button className="luxury-btn primary" onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : "Save Settings"}
          </button>
        </footer>
      </div>
    </div>
  );
}
`;

fs.writeFileSync(path.join(__dirname, 'temp_hub.tsx'), content);
console.log("Wrote temp_hub.tsx successfully");
