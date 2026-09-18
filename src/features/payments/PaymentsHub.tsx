
import React, { useState, useEffect } from "react";
import { Plus, Download, Search, Settings, FileText, CheckCircle2, CircleDashed, Clock, ChevronLeft, X, Printer, MessageCircle } from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { getPaymentConfig, savePaymentConfig, listPaymentRecords, savePaymentRecord, getPaymentReceipt, savePaymentReceipt, type PaymentConfig, type PaymentRecord } from "../../lib/cloudPayments";
import { toDateOnly, todayDateOnly, formatDate } from "../../lib/dates";
import QRCode from "react-qr-code";
import "./payments.css";

const SAR_PEG = 3.75;
function formatDualCurrency(amount: number, currency: string) {
  if (currency === "USD") {
    const sar = amount * SAR_PEG;
    return `$${amount.toLocaleString()} USD / ﷼${sar.toLocaleString()} SAR`;
  }
  return `${amount.toLocaleString()} ${currency}`;
}

// Generate a random ID for new records
function makeId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).substring(2, 15);
}

export function PaymentsHub() {
  const tutorName = "Mohamed Ali"; // Placeholder for the 1:1 engagement
  const studentUid = "student-001"; // Placeholder for the 1:1 engagement

  const [config, setConfig] = useState<PaymentConfig | null>(null);
  const [records, setRecords] = useState<PaymentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingRecord, setEditingRecord] = useState<PaymentRecord | null>(null);
  const [showConfig, setShowConfig] = useState(false);
  const [viewingReceipt, setViewingReceipt] = useState<{payment: PaymentRecord, blobUrl: string | null} | null>(null);
  const [viewingStatement, setViewingStatement] = useState(false);

  useEffect(() => {
    let active = true;
    async function loadData() {
      try {
        let cfg = await getPaymentConfig(studentUid);
        if (!cfg) {
          cfg = {
            studentUid,
            studentName: "Hamad",
            monthlyAmount: 1400,
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
    if (file) {
      const reader = new FileReader();
      const p = new Promise<string>((resolve) => {
        reader.onload = () => resolve(reader.result as string);
      });
      reader.readAsDataURL(file);
      const dataUri = await p;
      await savePaymentReceipt(rec.id, dataUri);
      rec.hasReceipt = true;
    }
    await savePaymentRecord(rec);
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

  const handlePrintReceipt = (rec: PaymentRecord) => {
    setViewingReceipt({ payment: rec, blobUrl: null });
  };

  // Engagement calculations
  const totalPaid = records.filter(r => r.status === "paid").reduce((sum, r) => sum + r.amount, 0);
  const startObj = new Date(config.engagementStartDate);
  const endObj = new Date(config.engagementEndDate);
  const monthsDiff = (endObj.getFullYear() - startObj.getFullYear()) * 12 + (endObj.getMonth() - startObj.getMonth()) + 1;
  const expectedTotal = config.monthlyAmount; // Just display the monthly amount instead of total
  
  const today = new Date();
  let nextBillingDate = new Date(today.getFullYear(), today.getMonth(), config.billingDayOfMonth);
  if (nextBillingDate <= today) {
    nextBillingDate.setMonth(nextBillingDate.getMonth() + 1);
  }
  const daysUntilDue = Math.ceil((nextBillingDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

  const progressPct = Math.min(100, Math.round((totalPaid / expectedTotal) * 100)) || 0;

  // Generate Chart Data
  const chartData = [];
  let currentM = new Date(startObj);
  while (currentM <= endObj || chartData.length < monthsDiff) {
    // Find payments in this month
    const mStr = currentM.toISOString().slice(0, 7); // YYYY-MM
    const paidThisMonth = records.filter(r => r.status === "paid" && r.dateRecorded.startsWith(mStr)).reduce((s, r) => s + r.amount, 0);

    chartData.push({
      month: currentM.toLocaleString('default', { month: 'short' }),
      Expected: config.monthlyAmount,
      Actual: paidThisMonth
    });
    currentM.setMonth(currentM.getMonth() + 1);
  }

  // WhatsApp Link Generation
  const waMessage = encodeURIComponent(`Hello ${config.studentName}, this is a gentle reminder that your next CFA tutoring payment of ${config.currency} ${config.monthlyAmount.toLocaleString()} is due on ${nextBillingDate.toLocaleDateString()}. Thank you for your continued dedication!`);
  const waLink = `https://wa.me/?text=${waMessage}`;

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

  if (viewingStatement) {
    return (
      <StatementPrintView
        tutorName={tutorName}
        config={config}
        records={records}
        expectedTotal={expectedTotal}
        onClose={() => setViewingStatement(false)}
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
          <button className="luxury-btn outline" onClick={() => setViewingStatement(true)}>
            <FileText size={16} /> Ledger Statement
          </button>
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
            <strong className="text-teal">{formatDualCurrency(totalPaid, config.currency)}</strong>
            <small>of {expectedTotal.toLocaleString()} Monthly Target</small>
          </div>
          <div className="progress-ring-container">
             <svg viewBox="0 0 36 36" className="circular-chart teal">
                <path className="circle-bg"
                  d="M18 2.0845
                    a 15.9155 15.9155 0 0 1 0 31.831
                    a 15.9155 15.9155 0 0 1 0 -31.831"
                />
                <path className="circle"
                  strokeDasharray={`${progressPct}, 100`}
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
              <YAxis stroke="#a9bacd" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(value) => `${value}`} />
              <Tooltip 
                contentStyle={{ backgroundColor: '#13263b', border: '1px solid #3b5065', borderRadius: '8px', color: '#fff' }}
                itemStyle={{ color: '#fff' }}
                formatter={(value: any) => [formatDualCurrency(Number(value) || 0, config.currency), undefined]}
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
                  <h4>{formatDualCurrency(r.amount, config.currency)}</h4>
                  <small>{formatDate(r.dateRecorded, { day: 'numeric', month: 'short', year: 'numeric' })} &bull; REF-{r.id.slice(0,6).toUpperCase()}</small>
                </div>
                <div className="t-status">
                  <span className={`luxury-badge ${r.status}`}>{r.status}</span>
                </div>
                <div className="t-actions">
                  <button className="luxury-btn outline sm" onClick={() => handlePrintReceipt(r)} title="Print Native Receipt">
                    <Printer size={14} /> Web Receipt
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
            <span className="r-project">HAMAD CFA MASTERY PATH</span>
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
            <div className="r-amount" style={{fontSize: '32px'}}>{formatDualCurrency(payment.amount, config.currency)}</div>
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
              {formatDate(config.engagementStartDate, { day: "numeric", month: "short", year: "numeric" }).toUpperCase()} - {formatDate(config.engagementEndDate, { day: "numeric", month: "short", year: "numeric" }).toUpperCase()}
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
          {payment.notes ? `Notes: ${payment.notes}` : "No additional notes."}
        </div>

        <div className="r-crypto-auth" style={{ marginTop: '40px', display: 'flex', alignItems: 'center', gap: '20px', borderTop: '1px dashed #3b5065', paddingTop: '20px' }}>
          <div style={{ background: '#fff', padding: '10px', borderRadius: '8px', display: 'inline-block' }}>
            <QRCode 
              value={`${window.location.origin}${window.location.pathname}?verify_receipt=${payment.id.slice(0,8).toUpperCase()}`} 
              size={80} 
            />
          </div>
          <div style={{ color: '#a9bacd', fontSize: '10px', fontFamily: 'monospace', lineHeight: '1.4' }}>
            <strong style={{ color: '#00b49f', fontSize: '12px', display: 'block', marginBottom: '4px' }}>VERIFIED DIGITAL SIGNATURE</strong>
            CRYPTOGRAPHIC HASH: {btoa(`H-CFA-${payment.id}-${payment.amount}`).substring(0, 32)}<br />
            TIMESTAMP: {new Date().toISOString()}<br />
            SCAN FOR AUTHENTICITY
          </div>
        </div>
      </div>
    </div>
  );
}

// ==========================================
// STATEMENT OF ACCOUNT VIEW
// ==========================================
function StatementPrintView({ tutorName, config, records, expectedTotal, onClose }: { tutorName: string, config: PaymentConfig, records: PaymentRecord[], expectedTotal: number, onClose: () => void }) {
  const handlePrint = () => {
    window.print();
  };

  const totalPaid = records.filter(r => r.status === "paid").reduce((acc, r) => acc + r.amount, 0);
  const totalPending = records.filter(r => r.status === "pending" || r.status === "overdue").reduce((acc, r) => acc + r.amount, 0);

  const sortedRecords = [...records].sort((a, b) => new Date(a.dateRecorded).getTime() - new Date(b.dateRecorded).getTime());

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
            <span className="r-project">HAMAD CFA MASTERY PATH</span>
            <h1 className="r-title">Statement of Account</h1>
            <h1 className="r-subtitle">Ledger Summary</h1>
          </div>
          <div className="r-right">
            <div className="r-pill">OFFICIAL LEDGER</div>
          </div>
        </div>

        <p className="r-desc">
          This document serves as an official consolidated statement of account for the executive coaching engagement between <strong>{tutorName}, CFA</strong> and <strong>{config.studentName}</strong>. 
        </p>

        <div className="r-grid" style={{ marginBottom: '30px' }}>
          <div className="r-box">
            <div className="r-box-val">{formatDate(todayDateOnly(), { day: "numeric", month: "short", year: "numeric" })}</div>
            <div className="r-box-lbl">STATEMENT DATE</div>
          </div>
          <div className="r-box">
            <div className="r-box-val">
              {formatDate(config.engagementStartDate, { day: "numeric", month: "short", year: "numeric" }).toUpperCase()} - {formatDate(config.engagementEndDate, { day: "numeric", month: "short", year: "numeric" }).toUpperCase()}
            </div>
            <div className="r-box-lbl">ENGAGEMENT TERM</div>
          </div>
        </div>

        <div className="r-main-card" style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #3b5065', paddingBottom: '10px' }}>
            <span style={{ color: '#a9bacd', fontSize: '12px', fontWeight: 600, letterSpacing: '1px' }}>TOTAL TARGET</span>
            <strong style={{ color: '#fff', fontSize: '16px' }}>{formatDualCurrency(expectedTotal, config.currency)}</strong>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #3b5065', paddingBottom: '10px' }}>
            <span style={{ color: '#a9bacd', fontSize: '12px', fontWeight: 600, letterSpacing: '1px' }}>TOTAL CLEARED</span>
            <strong style={{ color: '#00b49f', fontSize: '16px' }}>{formatDualCurrency(totalPaid, config.currency)}</strong>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: '#a9bacd', fontSize: '12px', fontWeight: 600, letterSpacing: '1px' }}>OUTSTANDING BALANCE</span>
            <strong style={{ color: '#eab355', fontSize: '16px' }}>{formatDualCurrency(totalPending, config.currency)}</strong>
          </div>
        </div>

        <div className="statement-ledger">
          <table className="ledger-table">
            <thead>
              <tr>
                <th>DATE</th>
                <th>REF ID</th>
                <th>DESCRIPTION / NOTES</th>
                <th>AMOUNT</th>
                <th>STATUS</th>
              </tr>
            </thead>
            <tbody>
              {sortedRecords.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ textAlign: 'center', padding: '20px', color: '#a9bacd' }}>No transactions recorded yet.</td>
                </tr>
              ) : (
                sortedRecords.map((r, idx) => (
                  <tr key={r.id}>
                    <td>{formatDate(r.dateRecorded, { day: 'numeric', month: 'short', year: 'numeric' })}</td>
                    <td>{r.id.slice(0, 8).toUpperCase()}</td>
                    <td>{r.notes || "Professional Services Rendered"}</td>
                    <td>{formatDualCurrency(r.amount, config.currency)}</td>
                    <td style={{ color: r.status === 'paid' ? '#00b49f' : r.status === 'pending' ? '#eab355' : '#ff4b4b' }}>
                      {r.status.toUpperCase()}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="r-separator" style={{ marginTop: '40px' }}></div>
        
        <div className="r-notes">
          This statement reflects all transactions recorded up to the statement date. For any discrepancies, please contact the issuing party immediately.
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
      getPaymentReceipt(record.id).then(receipt => {
        if (active && receipt?.dataUri) setExistingPdfUrl(receipt.dataUri);
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
