import { getDocument, GlobalWorkerOptions, type PDFDocumentLoadingTask, type PDFDocumentProxy } from "pdfjs-dist";
// The worker is self-hosted with the build, so it resolves below the GitHub
// Pages base path and no third-party viewer ever receives a document.
import workerSrc from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { validatePageCount } from "./materialTypes";
import { PdfOpenError } from "./pdfErrors";

export { PdfOpenError } from "./pdfErrors";

GlobalWorkerOptions.workerSrc = workerSrc;


export interface OpenedPdf {
  document: PDFDocumentProxy;
  pageCount: number;
  /** Destroys the document, its worker transport and cached pages. */
  destroy: () => Promise<void>;
}

/** Opens in-memory bytes; the caller's buffer is left intact (copied). */
export async function openPdf(bytes: Uint8Array): Promise<OpenedPdf> {
  const task: PDFDocumentLoadingTask = getDocument({
    data: bytes.slice(),
    enableXfa: false,
    disableAutoFetch: true,
    verbosity: 0,
  });
  let passwordRequested = false;
  // A password prompt would otherwise wait forever; the app never asks.
  task.onPassword = () => {
    passwordRequested = true;
    void task.destroy();
  };
  try {
    const document = await task.promise;
    return { document, pageCount: document.numPages, destroy: () => task.destroy() };
  } catch (error) {
    await task.destroy().catch(() => undefined);
    const name = typeof error === "object" && error !== null ? (error as { name?: string }).name : "";
    if (name === "PasswordException" || passwordRequested) {
      throw new PdfOpenError("password", "Password-protected PDFs cannot be added.", error);
    }
    throw new PdfOpenError("invalid", "The PDF could not be read.", error);
  }
}

/** Upload validation: parse the file and check the page bound. */
export async function inspectPdf(bytes: Uint8Array): Promise<{ pageCount: number }> {
  const opened = await openPdf(bytes);
  try {
    const problem = validatePageCount(opened.pageCount);
    if (problem) throw new PdfOpenError("invalid", problem);
    await opened.document.getPage(1);
    return { pageCount: opened.pageCount };
  } finally {
    await opened.destroy().catch(() => undefined);
  }
}
