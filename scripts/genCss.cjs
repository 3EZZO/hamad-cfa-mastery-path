const fs = require('fs');
const path = require('path');

const content = `
/* ==========================================
   LUXURY PAYMENTS DASHBOARD CSS
   World-class styling matching the Project 202 Proposal
========================================== */

.luxury-dashboard {
  padding: 40px;
  max-width: 1200px;
  margin: 0 auto;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  color: var(--ink);
}

.dashboard-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 48px;
}

.gradient-text {
  font-size: 36px;
  font-weight: 800;
  margin: 0 0 8px 0;
  background: linear-gradient(135deg, #fff 0%, #a9bacd 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  letter-spacing: -0.02em;
}

.dashboard-header p {
  margin: 0;
  color: var(--muted);
  font-size: 16px;
  letter-spacing: 0.02em;
}

.header-actions {
  display: flex;
  gap: 16px;
}

/* ==================
   LUXURY BUTTONS
================== */
.luxury-btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 12px 24px;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  border: none;
  text-decoration: none;
}

.luxury-btn.primary {
  background: linear-gradient(135deg, #00b49f 0%, #009382 100%);
  color: #fff;
  box-shadow: 0 4px 15px rgba(0, 180, 159, 0.3);
}

.luxury-btn.primary:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(0, 180, 159, 0.4);
}

.luxury-btn.outline {
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: var(--ink);
  backdrop-filter: blur(10px);
}

.luxury-btn.outline:hover {
  background: rgba(255, 255, 255, 0.08);
  border-color: rgba(255, 255, 255, 0.2);
}

.luxury-btn.sm {
  padding: 8px 16px;
  font-size: 12px;
}

.luxury-btn.icon-only {
  padding: 12px;
}

.luxury-btn.icon-only.sm {
  padding: 8px;
}

.luxury-btn.gold {
  color: #eab355;
  border-color: rgba(234, 179, 85, 0.3);
}
.luxury-btn.gold:hover {
  background: rgba(234, 179, 85, 0.1);
}

/* ==================
   GLASS CARDS
================== */
.glass-card {
  background: linear-gradient(145deg, rgba(29, 48, 67, 0.6) 0%, rgba(23, 38, 56, 0.4) 100%);
  border: 1px solid rgba(255, 255, 255, 0.05);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
  backdrop-filter: blur(20px);
  border-radius: 16px;
}

/* ==================
   METRICS GRID
================== */
.metrics-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
  gap: 24px;
  margin-bottom: 32px;
}

.metric-card {
  padding: 32px;
  display: flex;
  align-items: center;
  gap: 24px;
  position: relative;
  overflow: hidden;
}

.metric-card::before {
  content: '';
  position: absolute;
  top: 0; left: 0; right: 0;
  height: 2px;
  background: linear-gradient(90deg, transparent, rgba(255,255,255,0.1), transparent);
}

.metric-icon {
  width: 56px;
  height: 56px;
  border-radius: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.metric-icon.teal { background: rgba(0, 180, 159, 0.1); color: #00b49f; }
.metric-icon.gold { background: rgba(234, 179, 85, 0.1); color: #eab355; }

.metric-data {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.metric-data span {
  font-size: 13px;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0.1em;
  font-weight: 600;
}

.metric-data strong {
  font-size: 32px;
  font-weight: 700;
  letter-spacing: -0.02em;
}

.metric-data small {
  color: var(--muted);
  font-size: 13px;
}

.text-teal { color: #00b49f; }
.text-gold { color: #eab355; }
.alert-text { color: #ef4444 !important; font-weight: 600; }

/* Progress Ring */
.progress-ring-container {
  width: 72px;
  height: 72px;
}
.circular-chart {
  display: block;
  margin: 0 auto;
  max-width: 80%;
  max-height: 250px;
}
.circle-bg {
  fill: none;
  stroke: rgba(255, 255, 255, 0.05);
  stroke-width: 2.5;
}
.circle {
  fill: none;
  stroke-width: 2.5;
  stroke-linecap: round;
  transition: stroke-dasharray 1s ease-out;
}
.circular-chart.teal .circle { stroke: #00b49f; }
.percentage {
  fill: #fff;
  font-family: sans-serif;
  font-size: 8px;
  font-weight: bold;
  text-anchor: middle;
}

/* ==================
   CHART SECTION
================== */
.chart-card {
  padding: 32px;
  margin-bottom: 32px;
}
.chart-card h3 {
  margin: 0 0 24px 0;
  font-size: 20px;
  color: var(--ink);
  font-weight: 600;
}
.chart-wrapper {
  margin-left: -20px;
}

/* ==================
   TRANSACTIONS LIST
================== */
.transactions-card {
  padding: 32px;
}

.transactions-header {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 24px;
}

.transactions-header h3 {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
}

.badge {
  background: rgba(255, 255, 255, 0.1);
  padding: 4px 12px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 600;
  color: var(--muted);
}

.transactions-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.transaction-row {
  display: flex;
  align-items: center;
  padding: 20px;
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid rgba(255, 255, 255, 0.03);
  border-radius: 12px;
  transition: all 0.2s ease;
}

.transaction-row:hover {
  background: rgba(255, 255, 255, 0.04);
  border-color: rgba(255, 255, 255, 0.1);
  transform: translateX(4px);
}

.t-icon {
  width: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.t-details {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.t-details h4 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
}

.t-details small {
  color: var(--muted);
  font-size: 13px;
}

.t-status {
  width: 120px;
}

.luxury-badge {
  padding: 6px 12px;
  border-radius: 20px;
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.1em;
}

.luxury-badge.paid { background: rgba(0, 180, 159, 0.15); color: #00b49f; border: 1px solid rgba(0,180,159,0.3); }
.luxury-badge.pending { background: rgba(234, 179, 85, 0.15); color: #eab355; border: 1px solid rgba(234,179,85,0.3); }
.luxury-badge.overdue { background: rgba(239, 68, 68, 0.15); color: #ef4444; border: 1px solid rgba(239,68,68,0.3); }

.t-actions {
  display: flex;
  gap: 8px;
}

/* ==================
   MODALS
================== */
.luxury-modal {
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(13, 23, 35, 0.8);
  backdrop-filter: blur(8px);
}

.luxury-modal .modal-content {
  width: 100%;
  max-width: 500px;
  padding: 32px;
}

.luxury-modal .modal-header {
  border-bottom: 1px solid rgba(255,255,255,0.05);
  padding-bottom: 24px;
  margin-bottom: 24px;
}

.luxury-modal .modal-header h3 {
  font-size: 24px;
  font-weight: 600;
}

.glass-inputs label span {
  color: var(--muted);
  font-size: 13px;
  font-weight: 600;
  margin-bottom: 8px;
}

.glass-inputs input,
.glass-inputs select {
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: #fff;
  padding: 12px 16px;
  border-radius: 8px;
  transition: border-color 0.2s ease;
}

.glass-inputs input:focus,
.glass-inputs select:focus {
  outline: none;
  border-color: #00b49f;
  background: rgba(255, 255, 255, 0.05);
}

.input-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}

.luxury-modal .modal-footer {
  border-top: 1px solid rgba(255,255,255,0.05);
  padding-top: 24px;
  margin-top: 32px;
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}

/* ==================
   PRINT NATIVE HTML RECEIPT
================== */
.receipt-print-view {
  min-height: 100vh;
  background: #09121a;
  padding: 40px;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.receipt-controls {
  width: 100%;
  max-width: 800px;
  display: flex;
  justify-content: space-between;
  margin-bottom: 32px;
}

.receipt-document {
  width: 100%;
  max-width: 800px;
  background: #0c1825;
  min-height: 1056px; /* A4 aspect roughly at 96dpi */
  position: relative;
  padding: 64px;
  box-shadow: 0 24px 64px rgba(0,0,0,0.4);
  color: #fff;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
}

.receipt-top-accent {
  position: absolute;
  top: 64px;
  left: 64px;
  width: 80px;
  height: 4px;
  background: #eab355;
}

.receipt-header {
  margin-top: 48px;
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 48px;
}

.r-project {
  color: #00b49f;
  font-weight: 800;
  letter-spacing: 0.1em;
  font-size: 12px;
  display: block;
  margin-bottom: 16px;
}

.r-title {
  font-size: 42px;
  font-weight: 400;
  margin: 0;
}

.r-subtitle {
  font-size: 48px;
  font-weight: 800;
  margin: 0;
}

.r-pill {
  background: #eab355;
  color: #0c1825;
  padding: 8px 16px;
  border-radius: 24px;
  font-weight: 800;
  font-size: 11px;
  letter-spacing: 0.1em;
}

.r-desc {
  color: #a9bacd;
  font-size: 16px;
  line-height: 1.6;
  max-width: 600px;
  margin-bottom: 48px;
}

.r-main-card {
  background: #13263b;
  border-radius: 16px;
  padding: 40px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 32px;
}

.r-mc-left label {
  color: #00b49f;
  font-weight: 800;
  font-size: 12px;
  letter-spacing: 0.1em;
  display: block;
  margin-bottom: 8px;
}

.r-amount {
  font-size: 56px;
  font-weight: 800;
  color: #fff;
}

.r-mc-right {
  text-align: right;
}

.r-status-large {
  color: #eab355;
  font-size: 24px;
  font-weight: 800;
  letter-spacing: 0.05em;
  margin-bottom: 16px;
}

.r-meta {
  color: #a9bacd;
  font-size: 13px;
  margin-bottom: 4px;
}

.r-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 32px;
  margin-bottom: 64px;
}

.r-box {
  background: #13263b;
  border-radius: 16px;
  padding: 32px;
}

.r-box-val {
  color: #00b49f;
  font-size: 24px;
  font-weight: 700;
  margin-bottom: 8px;
}

.r-box-lbl {
  color: #a9bacd;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.1em;
}

.r-footer-details {
  display: flex;
  gap: 120px;
  margin-bottom: 32px;
}

.r-party label {
  color: #a9bacd;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.1em;
  display: block;
  margin-bottom: 8px;
}

.r-party strong {
  font-size: 18px;
  font-weight: 700;
}

.r-separator {
  height: 1px;
  background: rgba(255,255,255,0.1);
  margin-bottom: 32px;
}

.r-notes {
  color: #a9bacd;
  font-size: 14px;
  line-height: 1.6;
}

/* NATIVE PRINT STYLES */
@media print {
  body * {
    visibility: hidden;
  }
  .receipt-print-view, .receipt-print-view * {
    visibility: visible;
  }
  .receipt-print-view {
    position: absolute;
    left: 0;
    top: 0;
    width: 100%;
    padding: 0;
    background: #0c1825 !important;
  }
  .receipt-document {
    box-shadow: none;
    max-width: none;
    width: 100%;
    padding: 40px !important;
    background: #0c1825 !important;
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
  }
  .no-print {
    display: none !important;
  }
}
`;

fs.writeFileSync(path.join(__dirname, 'temp_css.css'), content);
console.log("Wrote temp_css.css successfully");
