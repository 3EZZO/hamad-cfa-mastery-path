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

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 20;

  // Colors from the proposal
  const bgDark = [12, 24, 37]; // #0c1825
  const bgCard = [19, 38, 59]; // #13263b
  const textLight = [255, 255, 255];
  const textMuted = [150, 165, 180];
  const colorTeal = [0, 180, 159]; // #00b49f
  const colorGold = [234, 179, 85]; // #eab355

  // Background
  doc.setFillColor(bgDark[0], bgDark[1], bgDark[2]);
  doc.rect(0, 0, pageWidth, pageHeight, "F");

  // Top Accent Line (Gold)
  doc.setFillColor(colorGold[0], colorGold[1], colorGold[2]);
  doc.rect(margin, margin + 25, 30, 2, "F");

  let y = margin + 15;

  // Header Left (Project Name)
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(colorTeal[0], colorTeal[1], colorTeal[2]);
  doc.text("PROJECT 202", margin, margin);

  // Header Right (Pill)
  doc.setFillColor(colorGold[0], colorGold[1], colorGold[2]);
  doc.roundedRect(pageWidth - margin - 50, margin - 4, 50, 6, 3, 3, "F");
  doc.setTextColor(bgDark[0], bgDark[1], bgDark[2]);
  doc.setFontSize(8);
  doc.text("OFFICIAL RECEIPT", pageWidth - margin - 25, margin, { align: "center" });

  // Title
  doc.setTextColor(textLight[0], textLight[1], textLight[2]);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(24);
  doc.text(`${config.studentName}'s CFA Level I`, margin, y);
  y += 10;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(28);
  doc.text("Mastery System", margin, y);
  
  y += 25;

  // Subtitle
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.setTextColor(textMuted[0], textMuted[1], textMuted[2]);
  const subtitle = "This document serves as an official receipt of payment for the private tutoring engagement between the stated candidate and tutor.";
  const splitSubtitle = doc.splitTextToSize(subtitle, pageWidth - margin * 2);
  doc.text(splitSubtitle, margin, y);
  
  y += splitSubtitle.length * 6 + 10;

  // Main Card
  doc.setFillColor(bgCard[0], bgCard[1], bgCard[2]);
  doc.roundedRect(margin, y, pageWidth - margin * 2, 45, 4, 4, "F");

  // Card Content Left
  doc.setTextColor(colorTeal[0], colorTeal[1], colorTeal[2]);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("AMOUNT PAID", margin + 10, y + 15);
  
  doc.setTextColor(textLight[0], textLight[1], textLight[2]);
  doc.setFontSize(36);
  doc.text(`${config.currency} ${payment.amount.toLocaleString()}`, margin + 10, y + 30);

  // Card Content Right
  doc.setTextColor(colorGold[0], colorGold[1], colorGold[2]);
  doc.setFontSize(12);
  doc.text(payment.status === "paid" ? "PAID IN FULL" : payment.status.toUpperCase(), pageWidth - margin - 10, y + 20, { align: "right" });
  
  doc.setTextColor(textMuted[0], textMuted[1], textMuted[2]);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(`RECEIPT REF: RCPT-${payment.id.slice(0, 8).toUpperCase()}`, pageWidth - margin - 10, y + 28, { align: "right" });
  doc.text(`ISSUED: ${formatDate(toDateOnly(new Date()), { day: "numeric", month: "short", year: "numeric" }).toUpperCase()}`, pageWidth - margin - 10, y + 34, { align: "right" });

  y += 55;

  // Details Grid
  const colWidth = (pageWidth - margin * 2 - 10) / 2;
  
  // Box 1
  doc.setFillColor(bgCard[0], bgCard[1], bgCard[2]);
  doc.roundedRect(margin, y, colWidth, 30, 4, 4, "F");
  doc.setTextColor(colorTeal[0], colorTeal[1], colorTeal[2]);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text(formatDate(payment.dateRecorded, { day: "numeric", month: "short", year: "numeric" }), margin + 10, y + 15);
  doc.setTextColor(textMuted[0], textMuted[1], textMuted[2]);
  doc.setFontSize(8);
  doc.text("PAYMENT DATE", margin + 10, y + 22);

  // Box 2
  doc.roundedRect(margin + colWidth + 10, y, colWidth, 30, 4, 4, "F");
  doc.setTextColor(colorTeal[0], colorTeal[1], colorTeal[2]);
  doc.setFontSize(14);
  // Engagement period
  const start = formatDate(config.engagementStartDate, { month: "short", year: "numeric" });
  const end = formatDate(config.engagementEndDate, { month: "short", year: "numeric" });
  doc.text(`${start} - ${end}`.toUpperCase(), margin + colWidth + 20, y + 15);
  doc.setTextColor(textMuted[0], textMuted[1], textMuted[2]);
  doc.setFontSize(8);
  doc.text("ENGAGEMENT TERM", margin + colWidth + 20, y + 22);

  y += 45;

  // Footer Details
  doc.setTextColor(textMuted[0], textMuted[1], textMuted[2]);
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  
  let labelY = y;
  doc.text("TUTOR", margin, labelY);
  doc.setTextColor(textLight[0], textLight[1], textLight[2]);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text(`${tutorName}, CFA`, margin, labelY + 6);

  doc.setTextColor(textMuted[0], textMuted[1], textMuted[2]);
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.text("CANDIDATE", margin + 80, labelY);
  doc.setTextColor(textLight[0], textLight[1], textLight[2]);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text(config.studentName, margin + 80, labelY + 6);

  y += 20;

  // Separator
  doc.setDrawColor(bgCard[0], bgCard[1], bgCard[2]);
  doc.line(margin, y, pageWidth - margin, y);
  
  y += 10;
  
  doc.setFontSize(9);
  doc.setTextColor(textMuted[0], textMuted[1], textMuted[2]);
  doc.setFont("helvetica", "normal");
  if (payment.notes) {
    doc.text(`Notes: ${payment.notes}`, margin, y);
  } else {
    doc.text("No additional notes.", margin, y);
  }
  
  return doc.output("blob");
}
