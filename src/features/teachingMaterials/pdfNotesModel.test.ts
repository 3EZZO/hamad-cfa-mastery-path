import { describe, expect, it } from "vitest";
import {
  EMPTY_PDF_NOTES, keyPageLabel, MAX_KEY_PAGES, MAX_PAGE_NOTE_CHARS, MAX_PAGE_NOTES, noteForPage, sanitizePdfNotes,
  withKeyPage, withoutKeyPage, withPageNote,
} from "./pdfNotesModel";

describe("PDF page notes and key pages", () => {
  it("sets, replaces and clears a page note", () => {
    const one = withPageNote(EMPTY_PDF_NOTES, 4, "Ask why duration falls")!;
    const two = withPageNote(one, 2, "Start here")!;
    expect(two.pages.map(entry => entry.page)).toEqual([2, 4]);
    expect(noteForPage(withPageNote(two, 4, "Replaced")!, 4)).toBe("Replaced");
    expect(withPageNote(two, 4, "   ")!.pages.map(entry => entry.page)).toEqual([2]);
    expect(noteForPage(withPageNote(EMPTY_PDF_NOTES, 1, "x".repeat(MAX_PAGE_NOTE_CHARS + 50))!, 1)).toHaveLength(MAX_PAGE_NOTE_CHARS);
  });

  it("refuses a new page note when the PDF is full but still edits existing ones", () => {
    const full = { pages: Array.from({ length: MAX_PAGE_NOTES }, (_, index) => ({ page: index + 1, text: "n" })), keyPages: [] };
    expect(withPageNote(full, MAX_PAGE_NOTES + 1, "more")).toBeNull();
    expect(noteForPage(withPageNote(full, 1, "edited")!, 1)).toBe("edited");
  });

  it("pins, relabels and unpins key pages", () => {
    const pinned = withKeyPage(EMPTY_PDF_NOTES, 9, "  Duration formula ")!;
    expect(pinned.keyPages).toEqual([{ page: 9, label: "Duration formula" }]);
    expect(withKeyPage(pinned, 9, "Exhibit 3")!.keyPages).toEqual([{ page: 9, label: "Exhibit 3" }]);
    expect(withoutKeyPage(pinned, 9).keyPages).toEqual([]);
    const full = { pages: [], keyPages: Array.from({ length: MAX_KEY_PAGES }, (_, index) => ({ page: index + 1, label: "" })) };
    expect(withKeyPage(full, 99, "x")).toBeNull();
    expect(keyPageLabel({ page: 9, label: "" })).toBe("p. 9");
    expect(keyPageLabel({ page: 9, label: "Exhibit 3" })).toBe("p. 9 · Exhibit 3");
  });

  it("sanitizes stored notes: valid pages only, one entry per page, sorted and bounded", () => {
    expect(sanitizePdfNotes(null)).toEqual(EMPTY_PDF_NOTES);
    expect(sanitizePdfNotes({
      pages: [{ page: 3, text: "c" }, { page: 0, text: "bad" }, { page: 1, text: "a" }, { page: 3, text: "c2" }, { page: 2, text: " " }, "x"],
      keyPages: [{ page: 5, label: "five" }, { page: 2.5, label: "bad" }, { page: 4, label: 7 }],
    })).toEqual({ pages: [{ page: 1, text: "a" }, { page: 3, text: "c2" }], keyPages: [{ page: 5, label: "five" }] });
  });
});
