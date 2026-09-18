import { jsPDF } from "jspdf";
import { type PaymentRecord, type PaymentConfig } from "../../lib/cloudPayments";
import { formatDate, toDateOnly } from "../../lib/dates";

export function generatePaymentReceipt(
  tutorName: string,
  config: PaymentConfig,
  payment: PaymentRecord
): Blob {
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  const margin = 20;
  const pageWidth = doc.internal.pageSize.getWidth();
  let y = margin;

  // Header
  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.text("PAYMENT RECEIPT", margin, y);
  
  y += 15;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(100);
  doc.text(`Receipt Reference: RCPT-${payment.id.slice(0, 8).toUpperCase()}`, margin, y);
  doc.text(`Date of Issue: ${formatDate(toDateOnly(new Date()), { day: "numeric", month: "short", year: "numeric" })}`, pageWidth - margin, y, { align: "right" });
  
  y += 20;
  
  // Parties
  doc.setTextColor(0);
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.text("From:", margin, y);
  doc.text("To:", pageWidth / 2, y);
  
  y += 6;
  doc.setFont("helvetica", "normal");
  doc.text(tutorName, margin, y);
  doc.text(config.studentName, pageWidth / 2, y);
  
  y += 6;
  doc.setFontSize(10);
  doc.setTextColor(100);
  doc.text("Tutor, Hamad CFA Mastery Path", margin, y);
  doc.text("Student, CFA Level I Tutoring", pageWidth / 2, y);
  
  y += 20;

  // Payment Details Header
  doc.setTextColor(0);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text("Payment Details", margin, y);
  
  y += 8;
  doc.setDrawColor(200);
  doc.line(margin, y, pageWidth - margin, y);
  
  y += 10;
  
  // Details
  doc.setFontSize(11);
  const details = [
    ["Payment Date:", formatDate(payment.dateRecorded, { day: "numeric", month: "short", year: "numeric" })],
    ["Amount Paid:", `${config.currency} ${payment.amount.toLocaleString()}`],
    ["Payment Status:", payment.status === "paid" ? "Paid in Full" : payment.status],
    ["Tutoring Engagement:", `${formatDate(config.engagementStartDate, { day: "numeric", month: "short", year: "numeric" })} – ${formatDate(config.engagementEndDate, { day: "numeric", month: "short", year: "numeric" })}`]
  ];

  details.forEach(([label, value]) => {
    doc.setFont("helvetica", "bold");
    doc.text(label, margin, y);
    doc.setFont("helvetica", "normal");
    doc.text(value, margin + 50, y);
    y += 10;
  });

  if (payment.notes) {
    y += 5;
    doc.setFont("helvetica", "bold");
    doc.text("Notes:", margin, y);
    doc.setFont("helvetica", "normal");
    const splitNotes = doc.splitTextToSize(payment.notes, pageWidth - margin * 2 - 50);
    doc.text(splitNotes, margin + 50, y);
    y += splitNotes.length * 5 + 5;
  }

  y += 10;
  doc.line(margin, y, pageWidth - margin, y);

  y += 25;
  doc.setFont("helvetica", "italic");
  doc.setFontSize(10);
  doc.setTextColor(120);
  doc.text("Thank you for your continued dedication to the mastery path.", margin, y);
  
  y += 6;
  doc.text("This receipt is automatically generated and serves as official proof of payment.", margin, y);

  return doc.output("blob");
}
