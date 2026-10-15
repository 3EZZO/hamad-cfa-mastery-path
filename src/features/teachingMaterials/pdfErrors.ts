/** Kept apart from pdfEngine so callers can classify errors without loading pdf.js. */
export type PdfOpenErrorKind = "password" | "invalid" | "cancelled";

export class PdfOpenError extends Error {
  readonly kind: PdfOpenErrorKind;
  constructor(kind: PdfOpenErrorKind, message: string, cause?: unknown) {
    super(message, { cause });
    this.name = "PdfOpenError";
    this.kind = kind;
  }
}
