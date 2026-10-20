/**
 * Private notes that belong to a PDF version rather than to one session:
 * a note per page and pinned key pages. Owning tutor only; never shared.
 */

export interface PageNote {
  page: number;
  text: string;
}

export interface KeyPage {
  page: number;
  label: string;
}

export interface PdfNotes {
  pages: PageNote[];
  keyPages: KeyPage[];
}

export const MAX_PAGE_NOTES = 100;
export const MAX_PAGE_NOTE_CHARS = 2_000;
export const MAX_KEY_PAGES = 50;
export const MAX_KEY_LABEL_CHARS = 60;
const MAX_PAGE = 10_000;

export const EMPTY_PDF_NOTES: PdfNotes = { pages: [], keyPages: [] };

function validPage(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= 1 && (value as number) <= MAX_PAGE;
}

export function sanitizePdfNotes(value: unknown): PdfNotes {
  if (typeof value !== "object" || value === null) return EMPTY_PDF_NOTES;
  const record = value as Record<string, unknown>;
  const pages = new Map<number, string>();
  if (Array.isArray(record.pages)) {
    for (const item of record.pages) {
      const entry = item as Partial<PageNote> | null;
      if (entry && validPage(entry.page) && typeof entry.text === "string" && entry.text.trim()) {
        pages.set(entry.page, entry.text.slice(0, MAX_PAGE_NOTE_CHARS));
      }
    }
  }
  const keyPages = new Map<number, string>();
  if (Array.isArray(record.keyPages)) {
    for (const item of record.keyPages) {
      const entry = item as Partial<KeyPage> | null;
      if (entry && validPage(entry.page) && typeof entry.label === "string") {
        keyPages.set(entry.page, entry.label.slice(0, MAX_KEY_LABEL_CHARS));
      }
    }
  }
  return {
    pages: [...pages].map(([page, text]) => ({ page, text })).sort((a, b) => a.page - b.page).slice(0, MAX_PAGE_NOTES),
    keyPages: [...keyPages].map(([page, label]) => ({ page, label })).sort((a, b) => a.page - b.page).slice(0, MAX_KEY_PAGES),
  };
}

export function noteForPage(notes: PdfNotes, page: number): string {
  return notes.pages.find(entry => entry.page === page)?.text ?? "";
}

/** Sets a page's note; an empty note removes it. Returns null when full. */
export function withPageNote(notes: PdfNotes, page: number, text: string): PdfNotes | null {
  const others = notes.pages.filter(entry => entry.page !== page);
  const clipped = text.slice(0, MAX_PAGE_NOTE_CHARS);
  if (!clipped.trim()) return { ...notes, pages: others };
  if (others.length >= MAX_PAGE_NOTES) return null;
  return { ...notes, pages: [...others, { page, text: clipped }].sort((a, b) => a.page - b.page) };
}

/** Pins (or relabels) a key page. Returns null when the list is full. */
export function withKeyPage(notes: PdfNotes, page: number, label: string): PdfNotes | null {
  const others = notes.keyPages.filter(entry => entry.page !== page);
  if (others.length >= MAX_KEY_PAGES) return null;
  const clean = label.trim().slice(0, MAX_KEY_LABEL_CHARS);
  return { ...notes, keyPages: [...others, { page, label: clean }].sort((a, b) => a.page - b.page) };
}

export function withoutKeyPage(notes: PdfNotes, page: number): PdfNotes {
  return { ...notes, keyPages: notes.keyPages.filter(entry => entry.page !== page) };
}

export function keyPageLabel(entry: KeyPage): string {
  return entry.label ? `p. ${entry.page} · ${entry.label}` : `p. ${entry.page}`;
}
