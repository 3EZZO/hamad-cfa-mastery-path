/**
 * Builds small, valid, synthetic PDFs for tests. No real teaching material
 * is ever used as a committed fixture.
 */
export interface SyntheticPdfOptions {
  pages?: number;
  label?: string;
  /** Per-page [width, height] in points; defaults to US Letter. */
  sizes?: Array<[number, number]>;
}

function escapePdfText(value: string): string {
  return value.replace(/[\\()]/g, match => `\\${match}`).replace(/[^\x20-\x7e]/g, "?");
}

export function syntheticPdf({ pages = 1, label = "Synthetic material", sizes = [] }: SyntheticPdfOptions = {}): Uint8Array {
  const objects: string[] = [];
  const pageIds: number[] = [];
  objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objects[3] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>";
  let next = 4;
  for (let index = 0; index < pages; index += 1) {
    const [width, height] = sizes[index] ?? [612, 792];
    const pageId = next;
    const contentId = next + 1;
    next += 2;
    pageIds.push(pageId);
    const stream = `BT /F1 20 Tf 72 ${height - 96} Td (${escapePdfText(`${label} page ${index + 1}`)}) Tj ET`;
    objects[pageId] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${width} ${height}] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentId} 0 R >>`;
    objects[contentId] = `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`;
  }
  objects[2] = `<< /Type /Pages /Kids [${pageIds.map(id => `${id} 0 R`).join(" ")}] /Count ${pages} >>`;

  let body = "%PDF-1.4\n";
  const offsets: number[] = [];
  for (let id = 1; id < next; id += 1) {
    offsets[id] = body.length;
    body += `${id} 0 obj\n${objects[id]}\nendobj\n`;
  }
  const xref = body.length;
  body += `xref\n0 ${next}\n0000000000 65535 f \n`;
  for (let id = 1; id < next; id += 1) body += `${String(offsets[id]).padStart(10, "0")} 00000 n \n`;
  body += `trailer\n<< /Size ${next} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new TextEncoder().encode(body);
}
